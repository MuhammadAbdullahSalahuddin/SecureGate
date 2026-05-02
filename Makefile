.PHONY: up down logs seed

up:
	docker compose up --build -d

down:
	docker compose down -v

logs:
	docker compose logs -f

seed:
	cat ./docker/postgres/seed.sql | docker compose exec -T postgres psql -U admin -d securegate
