# Dívida técnica

Lista versionada. Cada item: o que dói, por que ainda não, o que desbloqueia.

| ID | Dívida | Por que espera | Desbloqueio |
| --- | --- | --- | --- |
| TD-001 | Resolvida no incremento local: integração com Postgres real e DB descartável | Histórico preservado | Regressões permanecem no check-full |
| TD-002 | Workflow agora torna E2E bloqueante; proteção remota ainda não verificada | App Blacksmith e branch protection pertencem ao repo destino | Piloto remoto em T-020 |
| TD-003 | React Doctor encontrou 12 avisos no pacote UI: exports de variantes, carregamento/contexto/memo de chart e keys por índice | Zero erros; componentes adotados funcionam nos testes; chart não é carregado pela página inicial | Revisar ao introduzir gráficos dinâmicos, sem alterar o DS apenas para obter uma pontuação |
