# Pokédex — Frontend

Interface React + TypeScript + Vite para consumir a API REST Spring Boot de Pokémon. O frontend fica isolado nesta pasta e não altera os arquivos Java nem o banco de dados.

## Requisitos

- Node.js 20.19+ ou 22.12+ (recomendado para Vite 6)
- Backend Spring Boot em execução
- Backend conectado ao Oracle

## Instalar dependências

No terminal, dentro da pasta `frontend`:

```bash
npm install
```

## Configurar a API

Por padrão, a interface usa `http://localhost:8080`. Para mudar o endereço, crie um arquivo `.env` dentro de `frontend`:

```env
VITE_API_URL=http://localhost:8080
```

Troque o valor pelo endereço base do backend, sem acrescentar `/pokemons`. Reinicie o servidor Vite depois de alterar o `.env`. O arquivo `.env.example` serve como modelo.

## Iniciar a interface

```bash
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://localhost:5173`.

## Iniciar o backend em outro terminal

Abra a pasta raiz do projeto Java (a que contém `pom.xml`) em um segundo terminal e execute:

```bash
./mvnw spring-boot:run
```

No Windows PowerShell:

```powershell
.\mvnw.cmd spring-boot:run
```

Se o projeto não tiver Maven Wrapper, use `mvn spring-boot:run` (ou `mvnw` conforme o ambiente).

**Importante:** o backend deve estar rodando e conectado ao Oracle para que os dados reais apareçam. A interface não usa Pokémon fictícios como resposta da API. Se o navegador bloquear a chamada por CORS, configure a origem do frontend no backend conforme a política já adotada pelo projeto, sem desabilitar a segurança globalmente.

## Build de produção

```bash
npm run build
npm run preview
```

## Rotas consumidas

- `GET /pokemons` — 404 é tratado como coleção vazia.
- `GET /pokemons/{codigo}` — busca por código.
- `POST /pokemons` — cadastra.
- `PUT /pokemons/{codigo}` — atualiza.
- `DELETE /pokemons/{codigo}` — exclui após confirmação.

O formulário valida código e nome obrigatórios, altura/peso não negativos e data de captura anterior a hoje. Erros retornados pela API são apresentados na tela.
