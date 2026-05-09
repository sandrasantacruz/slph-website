package main

import (
	"log"

	"github.com/joho/godotenv"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"

	_ "slph.de/backend/migrations"
)

func main() {
	isGoRun := osutils.IsProbablyGoRun()

	if isGoRun {
		// load .env in dev mode
		_ = godotenv.Load("../.env")
	}

	if err := validateSuperuserEnv(); err != nil {
		log.Fatal(err)
	}

	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		TemplateLang: migratecmd.TemplateLangGo,
		Automigrate:  isGoRun,
		Dir:          "migrations",
	})

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		if err := bootstrapSuperuserFromEnv(app); err != nil {
			return err
		}
		if err := bootstrapSettingsFromEnv(app); err != nil {
			return err
		}
		e.InstallerFunc = installerFuncWithAppURL
		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
