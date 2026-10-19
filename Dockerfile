# The conversion API (openapi/openapi.yaml) as a container:
#   docker build -t einvoice-api .
#   docker run --rm -p 8080:8080 einvoice-api
# Stateless: nothing is written to disk, so the container can run with --read-only.
FROM oven/bun:1.4.3-slim

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --omit peer --ignore-scripts

COPY src ./src
COPY schemas ./schemas
COPY validation ./validation
COPY trust ./trust

USER bun
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD bun -e "fetch('http://127.0.0.1:8080/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Listens on every interface inside the container; --eu-trust loads the bundled trusted-list snapshot for ?euTrust=true.
# Add --cors to call the API from a browser, or --limits '{"maxFileBytes":10485760}' to lower the upload cap.
ENTRYPOINT ["bun", "src/cli.ts", "serve", "--host", "0.0.0.0", "--port", "8080", "--eu-trust"]
