package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Singleton-Record für die settings-Collection. Wird per Migration angelegt,
// weil createRule/deleteRule der Collection auf null gesetzt sind — die API
// kann den Record also weder anlegen noch löschen.
const settingsSingletonID = "defaultsettings"

func init() {
	m.Register(func(app core.App) error {
		if rec, _ := app.FindRecordById("settings", settingsSingletonID); rec != nil {
			return nil
		}

		collection, err := app.FindCollectionByNameOrId("settings")
		if err != nil {
			return err
		}

		record := core.NewRecord(collection)
		record.Set("id", settingsSingletonID)
		record.Set("whatsapp", "")
		record.Set("phone", "")
		record.Set("email", "")
		return app.Save(record)
	}, func(app core.App) error {
		record, err := app.FindRecordById("settings", settingsSingletonID)
		if err != nil {
			return nil
		}
		return app.Delete(record)
	})
}
