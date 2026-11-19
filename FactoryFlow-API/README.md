# FactoryFlow API

API de gestion des ordres de fabrication et des matiÃ¨res premiÃ¨res.

## Gestion des matiÃ¨res premiÃ¨res

Toutes les routes de matiÃ¨res premiÃ¨res exigent un jeton Bearer obtenu via
`POST /api/auth/login`.

| MÃ©thode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/raw-materials` | Liste les matiÃ¨res actives; accepte `?search=` pour filtrer par SKU, nom ou fournisseur |
| `POST` | `/api/raw-materials` | CrÃ©e une matiÃ¨re premiÃ¨re |
| `GET` | `/api/raw-materials/:id` | Consulte une matiÃ¨re premiÃ¨re |
| `PATCH` | `/api/raw-materials/:id` | Modifie ses informations |
| `DELETE` | `/api/raw-materials/:id` | DÃ©sactive la matiÃ¨re (suppression logique) |
| `GET` | `/api/raw-materials/:id/movements` | Consulte l'historique des mouvements |
| `POST` | `/api/raw-materials/:id/movements` | Enregistre une entrÃ©e ou une sortie de stock |

Une matiÃ¨re nÃ©cessite `sku`, `name` et `unit`. `minimumStock`, `unitCost`,
`description` et `supplier` sont facultatifs. Le stock ne se modifie pas
directement lors de la crÃ©ation ou mise Ã  jour; il est gÃ©rÃ© par les mouvements.
Exemple de mouvement:

```json
{
  "movementType": "ENTRY",
  "quantity": 25,
  "unitCost": 4.5,
  "reason": "RÃ©approvisionnement"
}
```

Utilisez `EXIT` pour une sortie. La mise Ã  jour du stock et son historique sont
enregistrÃ©s dans une transaction MongoDB; une sortie supÃ©rieure au stock
disponible est refusÃ©e.

## Produits et composition

Les routes produits exigent aussi un jeton d'authentification.

| MÃ©thode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/products` | Liste les produits actifs |
| `POST` | `/api/products` | CrÃ©e un produit |
| `GET` | `/api/products/:id` | Consulte un produit et sa composition |
| `PATCH` | `/api/products/:id` | Modifie les informations du produit |
| `PUT` | `/api/products/:id/composition` | Remplace sa composition |

La composition indique les quantitÃ©s de matiÃ¨res premiÃ¨res nÃ©cessaires pour
fabriquer une unitÃ© du produit. Exemple:

```json
{
  "composition": [
    { "rawMaterial": "65f1234567890abcdef12345", "quantity": 2 }
  ]
}
```

Chaque matiÃ¨re doit Ãªtre active, et une mÃªme matiÃ¨re ne peut apparaÃ®tre qu'une
fois. La composition doit toujours contenir au moins une matiere premiere.

## Mouvements de stock

Les routes `/api/stock-movements` exigent un jeton d'authentification. Elles
permettent de consulter et d'enregistrer les mouvements des produits comme des
matiÃ¨res premiÃ¨res.

| MÃ©thode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/stock-movements` | Liste tous les mouvements |
| `GET` | `/api/stock-movements/:id` | Consulte un mouvement |
| `POST` | `/api/stock-movements` | Enregistre une entrÃ©e ou une sortie |

Pour crÃ©er un mouvement, envoyez `itemModel` (`Product` ou `RawMaterial`),
`item` (l'identifiant de l'article), `movementType` (`ENTRY` ou `EXIT`) et une
quantitÃ© positive. Les sorties supÃ©rieures au stock disponible sont refusÃ©es.

Dans `POST /api/products`, include a non-empty `composition`. Each material must
be active, appear once, and have a strictly positive quantity. `minimumStock`
and the initial stock may be zero.

## Ordres de fabrication multi-produits

`POST /api/production-orders` is an admin-only route. An order has one or more
unique product lines, with a positive quantity for each line:

```json
{
  "operator": "65f1234567890abcdef12345",
  "items": [
    { "product": "65f1234567890abcdef12346", "quantity": 10 },
    { "product": "65f1234567890abcdef12347", "quantity": 5 }
  ]
}
```

When the order is created, the API saves the product names and a copy of each
product's material composition. Later catalog edits do not change that order.
The API also accepts the older `product` and `quantity` fields as a one-line
order while existing clients are updated.

When an operator starts an order, the API totals each material across all
product lines, checks every required stock level, and then records stock exits
and changes the order status in one MongoDB transaction. If any material is
short, the transaction fails and no stock is consumed. Only planned orders can
start or be cancelled; in-progress orders can be completed.


