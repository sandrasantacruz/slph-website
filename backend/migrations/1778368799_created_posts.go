package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `{
			"createRule": "@request.auth.id != \"\"",
			"deleteRule": "@request.auth.id != \"\"",
			"fields": [
				{
					"autogeneratePattern": "[a-z0-9]{15}",
					"help": "",
					"hidden": false,
					"id": "text3208210256",
					"max": 15,
					"min": 15,
					"name": "id",
					"pattern": "^[a-z0-9]+$",
					"presentable": false,
					"primaryKey": true,
					"required": true,
					"system": true,
					"type": "text"
				},
				{
					"autogeneratePattern": "",
					"help": "",
					"hidden": false,
					"id": "text724990059",
					"max": 0,
					"min": 0,
					"name": "title",
					"pattern": "",
					"presentable": false,
					"primaryKey": false,
					"required": false,
					"system": false,
					"type": "text"
				},
				{
					"autogeneratePattern": "",
					"help": "",
					"hidden": false,
					"id": "text2560465762",
					"max": 0,
					"min": 0,
					"name": "slug",
					"pattern": "^[a-z0-9-]+$",
					"presentable": false,
					"primaryKey": false,
					"required": false,
					"system": false,
					"type": "text"
				},
				{
					"autogeneratePattern": "",
					"help": "",
					"hidden": false,
					"id": "text1591429585",
					"max": 0,
					"min": 0,
					"name": "excerpt",
					"pattern": "",
					"presentable": false,
					"primaryKey": false,
					"required": false,
					"system": false,
					"type": "text"
				},
				{
					"help": "",
					"hidden": false,
					"id": "json4274335913",
					"maxSize": 0,
					"name": "content",
					"presentable": false,
					"required": false,
					"system": false,
					"type": "json"
				},
				{
					"help": "",
					"hidden": false,
					"id": "file2366146245",
					"maxSelect": 0,
					"maxSize": 0,
					"mimeTypes": [],
					"name": "cover",
					"presentable": false,
					"protected": false,
					"required": false,
					"system": false,
					"thumbs": null,
					"type": "file"
				},
				{
					"help": "",
					"hidden": false,
					"id": "file3760176746",
					"maxSelect": 10,
					"maxSize": 0,
					"mimeTypes": null,
					"name": "images",
					"presentable": false,
					"protected": false,
					"required": false,
					"system": false,
					"thumbs": null,
					"type": "file"
				},
				{
					"help": "",
					"hidden": false,
					"id": "select2063623452",
					"maxSelect": 0,
					"name": "status",
					"presentable": false,
					"required": false,
					"system": false,
					"type": "select",
					"values": [
						"draft",
						"published",
						"archived"
					]
				},
				{
					"help": "",
					"hidden": false,
					"id": "date3772055009",
					"max": "",
					"min": "",
					"name": "published_at",
					"presentable": false,
					"required": false,
					"system": false,
					"type": "date"
				},
				{
					"hidden": false,
					"id": "autodate2990389176",
					"name": "created",
					"onCreate": true,
					"onUpdate": false,
					"presentable": false,
					"system": false,
					"type": "autodate"
				},
				{
					"hidden": false,
					"id": "autodate3332085495",
					"name": "updated",
					"onCreate": true,
					"onUpdate": true,
					"presentable": false,
					"system": false,
					"type": "autodate"
				}
			],
			"id": "pbc_1125843985",
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_a3k0wyiqdm` + "`" + ` ON ` + "`" + `posts` + "`" + ` (` + "`" + `slug` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_01or0n6t0r` + "`" + ` ON ` + "`" + `posts` + "`" + ` (\n  ` + "`" + `status` + "`" + `,\n  ` + "`" + `published_at` + "`" + `\n)"
			],
			"listRule": "@request.auth.id != \"\" || (status = \"published\" && published_at <= @now)",
			"name": "posts",
			"system": false,
			"type": "base",
			"updateRule": "@request.auth.id != \"\"",
			"viewRule": "@request.auth.id != \"\" || (status = \"published\" && published_at <= @now)"
		}`

		collection := &core.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1125843985")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
