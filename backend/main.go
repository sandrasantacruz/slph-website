package main

import (
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "slph.de/backend/migrations"
)

func main() {
	if err := validateSuperuserEnv(); err != nil {
		log.Fatal(err)
	}

	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

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
