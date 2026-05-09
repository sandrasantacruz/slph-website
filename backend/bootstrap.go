package main

import (
	"errors"
	"fmt"
	"log"
	"os"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// installerFuncWithAppURL wraps PocketBase's DefaultInstallerFunc but swaps the
// listen-address baseURL for Settings().Meta.AppURL when one is configured.
// Without this, the printed install URL in the log uses 127.0.0.1:<port>, which
// is useless from outside the container.
func installerFuncWithAppURL(app core.App, su *core.Record, baseURL string) error {
	if v := app.Settings().Meta.AppURL; v != "" {
		baseURL = v
	}
	return apis.DefaultInstallerFunc(app, su, baseURL)
}

// bootstrapSuperuserFromEnv ensures a superuser exists matching the credentials
// provided via env vars. Triggered on every serve start.
//
//	PB_SUPERUSER_EMAIL     required to enable bootstrap
//	PB_SUPERUSER_PASSWORD  required to enable bootstrap
//	PB_SUPERUSER_UPDATE    if "1"/"true", overwrite the password when the user
//	                       already exists (default: leave existing untouched)
func bootstrapSuperuserFromEnv(app core.App) error {
	email := os.Getenv("PB_SUPERUSER_EMAIL")
	password := os.Getenv("PB_SUPERUSER_PASSWORD")
	if email == "" || password == "" {
		return nil
	}

	existing, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
	if err != nil {
		// not found → create
		collection, cerr := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
		if cerr != nil {
			return fmt.Errorf("superuser bootstrap: load collection: %w", cerr)
		}
		record := core.NewRecord(collection)
		record.Set("email", email)
		record.Set("password", password)
		if serr := app.Save(record); serr != nil {
			return fmt.Errorf("superuser bootstrap: create %q: %w", email, serr)
		}
		log.Printf("[bootstrap] created superuser %s from env", email)
		return nil
	}

	if !envFlag("PB_SUPERUSER_UPDATE") {
		return nil
	}

	existing.Set("password", password)
	if err := app.Save(existing); err != nil {
		return fmt.Errorf("superuser bootstrap: update %q: %w", email, err)
	}
	log.Printf("[bootstrap] updated superuser %s password from env", email)
	return nil
}

// bootstrapSettingsFromEnv overrides Meta settings with env values when they
// are set. Empty env vars leave the admin-configured value untouched.
//
//	PB_APP_URL    Settings > Application > Application URL
//	PB_APP_NAME   Settings > Application > Application name
func bootstrapSettingsFromEnv(app core.App) error {
	settings := app.Settings()
	changed := false

	if v := os.Getenv("PB_APP_URL"); v != "" && settings.Meta.AppURL != v {
		settings.Meta.AppURL = v
		changed = true
	}
	if v := os.Getenv("PB_APP_NAME"); v != "" && settings.Meta.AppName != v {
		settings.Meta.AppName = v
		changed = true
	}

	if !changed {
		return nil
	}
	if err := app.Save(settings); err != nil {
		return fmt.Errorf("settings bootstrap: %w", err)
	}
	log.Printf("[bootstrap] applied settings overrides from env (appURL=%q appName=%q)",
		settings.Meta.AppURL, settings.Meta.AppName)
	return nil
}

func envFlag(key string) bool {
	switch os.Getenv(key) {
	case "1", "true", "TRUE", "yes", "on":
		return true
	}
	return false
}

// validateSuperuserEnv fails fast if exactly one of email/password is set.
// A common footgun: typo in one of the var names → silent no-op.
func validateSuperuserEnv() error {
	email := os.Getenv("PB_SUPERUSER_EMAIL")
	password := os.Getenv("PB_SUPERUSER_PASSWORD")
	if (email == "") != (password == "") {
		return errors.New("PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD must both be set or both unset")
	}
	return nil
}
