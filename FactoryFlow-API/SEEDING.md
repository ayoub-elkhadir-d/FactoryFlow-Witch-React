# Database seeding

The single seeder creates or refreshes:

- Admin and operator users
- Raw materials and products with their compositions
- Production orders in planified, in-progress, completed, and cancelled states
- Opening stock and production stock movements
- The installation state needed to show the login screen

Copy .env.example to .env, then set SEED_ADMIN_PASSWORD to at least 8 characters. SEED_OPERATOR_PASSWORD is optional; if omitted, the operator uses the admin password.

From this folder, run one command:

    docker compose run --rm seed

Compose starts MongoDB if needed, waits for its health check, runs the complete seeder, and exits. The seeder is idempotent: running it again refreshes the marked seed records instead of adding duplicates.
