
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

seed:
	docker compose exec postgres psql -U admin -d securegate -f /tmp/seed.sql
seed-vault:
	docker compose exec app npx tsx docker/seed-vault.ts

shell-pg:
	docker compose exec postgres psql -U admin -d securegate

shell-redis:
	docker compose exec redis redis-cli -a admin

shell-mongo:
	docker compose exec mongo mongosh -u admin -p admin
