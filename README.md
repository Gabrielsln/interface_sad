TRABALHO PRATICO DA U2 — INTERFACE DO SGF
Sistemas de Apoio a Decisao (UCSAL • 2026.2) • Prof. Rafael Bispo

EQUIPE E INTEGRANTES
- Equipe: Dupla 05
- Integrantes: Gabriel Silva Nunes | Felipe Juan Azevedo da Paixão | Wesley Oliveira Cintra
- Base de referencia: Planilha SGF — Dupla 05 (Abas 01 a 06)

ARQUIVOS DO PROJETO E ORIGEM DOS INDICADORES
- index.html, style.css, app.js: interface web em HTML, CSS e JavaScript nativos (sem frameworks ou internet).
- server.py: backend em Python puro (apenas biblioteca padrao) que le os CSVs UTF-8 em tempo real,
  calcula os indicadores descritivos, correlacao de Pearson, StandardScaler (treino) e KNN, e serve a pagina.
- dados/base_especifica.csv (44 registros): copia UTF-8 da Aba 04 (Curva ABC - Base Especifica) combinada
  com a Aba 06 (Tabela de Apoio: Treino=30, Teste=14). Origina os indicadores da Base Especifica e o KNN.
- dados/base_geral.csv (356 registros): copia UTF-8 da Aba 03 (Curva ABC - Base Geral). Origina os
  indicadores e o painel da Curva ABC da Base Geral.
- data.js: espelho local offline gerado diretamente dos dois CSVs acima para permitir abrir index.html
  diretamente no navegador (file://) mesmo sem iniciar o backend Python.

COMO ABRIR E EXECUTAR
1. Modo com Backend Python puro (recomendado):
   - No terminal, dentro da pasta do projeto, execute:  python server.py
   - Abra no navegador:  http://127.0.0.1:8000
   - O topo exibira o selo verde confirmando o uso do backend Python puro sobre os CSVs.
2. Modo local offline direto (sem servidor ou internet):
   - Abra diretamente o arquivo index.html no navegador (duplo clique).
   - A interface funcionara integralmente usando JavaScript nativo e data.js.

SEQUENCIA PARA TESTAR A CONSULTA VALIDA E A ENTRADA INVALIDA
1. Conferir os indicadores na Secao 2 alternando entre Base Especifica (N=44) e Base Geral (N=356),
   verificando variaveis, unidades e conferencia com a Aba 05.
2. Consulta valida (novo item): na Secao 3, informe QTD = 100, VLR_UNIT = 60, k = 3 (ou clique em
   "Carregar exemplo da Aba 06") e clique em "Classificar com KNN". Resultado esperado: Classe prevista B,
   com vizinhos Linhas 13 (A), 21 (B) e 23 (B) e interpretacao na Secao 4.
3. Consulta demonstrativa do laboratorio: selecione um dos 14 casos de teste da Aba 06 e clique em
   "Visualizar caso do laboratorio" para comprovar correspondencia 14/14 com a planilha.
4. Entrada invalida (erro controlado): clique em "Testar entrada invalida" (ou digite texto como "abc"
   ou deixe o campo vazio / negativo) e clique em "Classificar com KNN". A tela exibira alerta vermelho
   explicando o erro sem executar classificacao indevida.

## Estrutura do Repositório

```text
interface_sad/
├── index.html                 # Página principal da interface web (HTML5 semântico)
├── style.css                  # Folha de estilos da interface (CSS3 nativo)
├── app.js                     # Lógica de interface, validação e fallback offline (JS nativo)
├── data.js                    # Espelho local offline dos CSVs para execução via file://
├── server.py                  # Backend HTTP em Python puro (cálculos estatísticos, KNN e arquivos estáticos)
├── README.md                  # Documentação do projeto e instruções de uso
└── dados/                     # Bases de dados em CSV UTF-8 extraídas da planilha SGF
    ├── base_especifica.csv    # 44 registros da Base Específica (30 treino / 14 teste do KNN)
    └── base_geral.csv         # 356 registros da Base Geral (Curva ABC e estatísticas)
```

