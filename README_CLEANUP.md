# 🧹 Scripts de Limpeza do Banco de Dados

Este conjunto de scripts permite fazer backup e limpeza completa de todos os pedidos do banco de dados.

## ⚠️ ATENÇÃO

**ESTA OPERAÇÃO É IRREVERSÍVEL!** Todos os pedidos e dados relacionados serão **PERDIDOS PERMANENTEMENTE**.

## 📁 Arquivos Criados

- `clear_orders.js` - Script para limpar o banco de dados
- `backup_orders.js` - Script para fazer backup completo (pode ser lento)
- `backup_orders_optimized.js` - Script para fazer backup otimizado (rápido)
- `clean_database.js` - Script principal (backup + limpeza)
- `clear_only.js` - Script para limpeza direta sem backup
- `clear_orders.sql` - Script SQL direto para limpeza

## 🚀 Como Usar

### Opção 1: Script Principal (Recomendado)

```bash
# 1. Backup otimizado + Limpeza completa
node clean_database.js SIM
```

### Opção 2: Limpeza Direta (Sem Backup)

```bash
# ⚠️ PERIGO: Limpa sem backup!
node clear_only.js SIM
```

### Opção 3: Scripts Individuais

```bash
# 1. Fazer backup otimizado
node backup_orders_optimized.js

# 2. Limpar banco (requer confirmação)
node clear_orders.js SIM
```

### Opção 4: SQL Direto

```bash
# Executar o script SQL diretamente no MySQL
mysql -u usuario -p database < clear_orders.sql
```

## 📊 O que é Limpo

### Tabelas Principais:
- ✅ `orders` - Todos os pedidos
- ✅ `order_offers` - Todas as ofertas de pedidos
- ✅ `order_items` - Todos os itens de pedidos
- ✅ `order_item_acrescimo` - Todos os acréscimos
- ✅ `delivery_history` - Todo o histórico de entregas
- ✅ `order_offer_logs` - Todos os logs de ofertas

### Dados Relacionados:
- ✅ Notificações de pedidos, entregas e ofertas
- ✅ Configurações de notificações de entregadores
- ✅ Movimentações de caixa de pedidos
- ✅ Itens de venda PDV de pedidos

## 🔒 Segurança

### Backup Automático:
- ✅ Backup otimizado antes da limpeza
- ✅ Arquivos salvos em `/backups/`
- ✅ Timestamp no nome do arquivo
- ✅ Metadados e contagens salvos

### Confirmação Dupla:
- ✅ Verificação de dados antes da limpeza
- ✅ Confirmação explícita necessária
- ✅ Logs detalhados de todas as operações

## 📋 Pré-requisitos

1. **Node.js** instalado
2. **MySQL** configurado
3. **Variáveis de ambiente** configuradas:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=seu_banco
```

## 🔍 Verificação

Após a limpeza, o script verifica se todas as tabelas estão vazias:

```sql
SELECT 
    'orders' as tabela,
    COUNT(*) as registros
FROM orders
UNION ALL
SELECT 
    'order_offers' as tabela,
    COUNT(*) as registros
FROM order_offers
-- ... outras tabelas
```

## 📈 Estatísticas

O script mostra estatísticas antes e depois:

```
📋 Dados atuais:
   - Pedidos: 2120
   - Ofertas: 6245
   - Itens de pedidos: 5258
   - Histórico de entregas: 7
   - Logs de ofertas: 1234
   - Notificações: 567
   - Configurações de notificações: 89

📋 Resultado final:
   - Pedidos: 0
   - Ofertas: 0
   - Itens de pedidos: 0
   - Histórico de entregas: 0
   - Logs de ofertas: 0
   - Notificações: 0
   - Configurações de notificações: 0
```

## 🚨 Avisos Importantes

1. **SEMPRE** faça backup antes de limpar
2. **VERIFIQUE** se está no banco correto
3. **CONFIRME** se realmente quer apagar tudo
4. **TESTE** em ambiente de desenvolvimento primeiro

## 🔄 Restauração

Para restaurar dados do backup:

```javascript
// Exemplo de script de restauração
const backupData = require('./backups/orders_backup_2025-01-07T10-30-00-000Z.json');

// Restaurar pedidos
for (const order of backupData.orders) {
  await connection.execute('INSERT INTO orders SET ?', order);
}
```

## 📞 Suporte

Em caso de problemas:
1. Verifique as variáveis de ambiente
2. Confirme a conexão com o banco
3. Verifique os logs de erro
4. Restaure do backup se necessário

## 🎯 Comandos Rápidos

```bash
# Navegar para o diretório
cd painel-entregador-backend

# Backup + Limpeza (recomendado)
node clean_database.js SIM

# Apenas limpeza (perigoso!)
node clear_only.js SIM

# Apenas backup
node backup_orders_optimized.js
```

---

**⚠️ LEMBRE-SE: Esta operação é IRREVERSÍVEL! Use com cuidado!** 