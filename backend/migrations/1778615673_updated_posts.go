package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1125843985")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_a3k0wyiqdm` + "`" + ` ON ` + "`" + `news` + "`" + ` (` + "`" + `slug` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_01or0n6t0r` + "`" + ` ON ` + "`" + `news` + "`" + ` (\n  ` + "`" + `status` + "`" + `,\n  ` + "`" + `published_at` + "`" + `\n)"
			],
			"name": "news"
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1125843985")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_a3k0wyiqdm` + "`" + ` ON ` + "`" + `posts` + "`" + ` (` + "`" + `slug` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_01or0n6t0r` + "`" + ` ON ` + "`" + `posts` + "`" + ` (\n  ` + "`" + `status` + "`" + `,\n  ` + "`" + `published_at` + "`" + `\n)"
			],
			"name": "posts"
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
