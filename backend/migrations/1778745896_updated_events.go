package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1687431684")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_a3k0wyiqdmahh` + "`" + ` ON ` + "`" + `posts` + "`" + ` (` + "`" + `slug` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_01or0n6t0ru6c` + "`" + ` ON ` + "`" + `posts` + "`" + ` (\n  ` + "`" + `status` + "`" + `,\n  ` + "`" + `published_at` + "`" + `\n)"
			],
			"name": "posts"
		}`), &collection); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(1, []byte(`{
			"help": "",
			"hidden": false,
			"id": "select37857821",
			"maxSelect": 0,
			"name": "typ",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "select",
			"values": [
				"event",
				"news"
			]
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1687431684")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_a3k0wyiqdmahh` + "`" + ` ON ` + "`" + `events` + "`" + ` (` + "`" + `slug` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_01or0n6t0ru6c` + "`" + ` ON ` + "`" + `events` + "`" + ` (\n  ` + "`" + `status` + "`" + `,\n  ` + "`" + `published_at` + "`" + `\n)"
			],
			"name": "events"
		}`), &collection); err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("select37857821")

		return app.Save(collection)
	})
}
