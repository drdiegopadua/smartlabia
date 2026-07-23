#!/bin/sh
set -e

echo "Aplicando migracoes do banco de dados..."
npx prisma migrate deploy

echo "Iniciando SmartLabIA..."
exec node dist/server.js
