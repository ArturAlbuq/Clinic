# Plugin clinic-dev

Plugin especialista para o projeto Clinic. Carrega automaticamente domínio de negócio, padrões Supabase, convenções Next.js, fluxo de trabalho e agentes especializados.

## Status
✅ **Instalado globalmente** em `~/.claude/plugins/clinic-dev`

## Skills Disponíveis

Invoque diretamente no Claude Code:

```
/clinic-dev:clinic-domain       — Domínio de negócio, terminologia, regras
/clinic-dev:supabase-patterns   — Padrões de banco, RLS, migrations, realtime
/clinic-dev:nextjs-app-router   — Convenções Next.js, tipos, componentes
/clinic-dev:vibe-coding-workflow — Fluxo de trabalho, estrutura de prompts, regras
```

## Agentes Disponíveis

Use com a ferramenta `Agent`:

- **spec-agent** — Especificação funcional e fluxos
- **migration-agent** — Migrations e schema Supabase
- **audit-agent** — Segurança, RLS e auditoria

## Conectores MCP

O plugin inclui configuração para:
- Supabase (banco de dados)
- Vercel (deploy)

Verifique em `Customize → Connectors` se estão habilitados.

## Recarregar

Após modificações no plugin, execute:
```
/reload-plugins
```

---

**Instalado em:** 2026-04-12
