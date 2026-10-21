# Build both workspaces once; no deployment credentials are build arguments.
FROM node:24-alpine AS build
WORKDIR /build
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm build

# Deploy resolves workspace links into a self-contained production dependency tree.
# Restrict our workspace packages to compiled files before packaging them.
RUN node --input-type=module -e 'import {readFileSync,writeFileSync,existsSync} from "node:fs"; for (const dir of ["apps/backend","packages/db-types","packages/dbmigrator","packages/auth"]) { const file=dir+"/package.json"; if (existsSync(file)) { const data=JSON.parse(readFileSync(file,"utf8")); data.files=["dist"]; writeFileSync(file,JSON.stringify(data)); } }' \
    && pnpm --filter @renova/backend deploy --prod --legacy /runtime/apps/backend \
    && mkdir -p /runtime/apps/frontend /runtime/packages /runtime/scripts \
    && cp -R apps/frontend/dist /runtime/apps/frontend/dist \
    && ln -s apps/backend/node_modules /runtime/node_modules \
    && for name in db-types dbmigrator; do \
         if [ -d "packages/$name/dist" ]; then \
           mkdir -p "/runtime/packages/$name"; \
           cp "packages/$name/package.json" "/runtime/packages/$name/package.json"; \
           cp -R "packages/$name/dist" "/runtime/packages/$name/dist"; \
         fi; \
       done \
    && mkdir -p /runtime/scripts/deploy \
    && cp scripts/deploy/env.mjs scripts/deploy/predeploy.mjs scripts/deploy/start.sh /runtime/scripts/deploy/ \
    && mkdir -p /runtime/scripts/linx \
    && cp -R scripts/linx/. /runtime/scripts/linx/ \
    && if [ -d scripts/auth ]; then cp -R scripts/auth /runtime/scripts/auth; fi \
    && cp renova.project.json /runtime/renova.project.json

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=::
COPY --from=build --chown=node:node /runtime/ ./
USER node
EXPOSE 3000
CMD ["sh", "scripts/deploy/start.sh"]
