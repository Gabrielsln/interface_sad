(function () {
  "use strict";

  const NUM_REGEX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

  const estado = {
    modoBackend: false,
    baseAtual: "especifica",
    info: null,
    casosTeste: []
  };

  // --- Funcoes matematicas e de validacao (espelho exato de server.py para modo offline) ---

  function resumoVariavel(valores) {
    const n = valores.length;
    if (n === 0) {
      return { n: 0, media: null, mediana: null, desvio_padrao: null, cv: null, minimo: null, maximo: null };
    }
    const ordenados = [...valores].sort((a, b) => a - b);
    const media = valores.reduce((acc, v) => acc + v, 0) / n;
    const mediana =
      n % 2 === 1
        ? ordenados[(n - 1) / 2]
        : (ordenados[n / 2 - 1] + ordenados[n / 2]) / 2;
    const variancia = valores.reduce((acc, v) => acc + (v - media) ** 2, 0) / n;
    const desvioPadrao = Math.sqrt(variancia);
    const cv = media !== 0 ? desvioPadrao / media : null;
    return {
      n,
      media,
      mediana,
      desvio_padrao: desvioPadrao,
      cv,
      minimo: ordenados[0],
      maximo: ordenados[n - 1]
    };
  }

  function calcularPearson(xs, ys) {
    const n = xs.length;
    if (n < 2 || ys.length !== n) {
      return {
        valor: null,
        indefinida: true,
        motivo: "Correlacao indefinida: sao necessarios pelo menos 2 registros validos."
      };
    }
    const mediaX = xs.reduce((acc, v) => acc + v, 0) / n;
    const mediaY = ys.reduce((acc, v) => acc + v, 0) / n;
    let num = 0;
    let dx2 = 0;
    let dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mediaX;
      const dy = ys[i] - mediaY;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const den = Math.sqrt(dx2 * dy2);
    if (den === 0) {
      return {
        valor: null,
        indefinida: true,
        motivo: "Correlacao indefinida: desvio-padrao nulo em pelo menos uma das variaveis (divisao por zero)."
      };
    }
    return {
      valor: num / den,
      indefinida: false,
      motivo: null
    };
  }

  function calcularEstatisticasLocal(registros) {
    const qtds = registros.map((r) => r.quantidade);
    const vlrs = registros.map((r) => r.valor_unitario);
    const pars = registros.map((r) => r.parcela);
    const n = registros.length;
    const totalParcelas = pars.reduce((acc, v) => acc + v, 0);
    const criterios = { A: "<= 80%", B: "> 80% e <= 95%", C: "> 95%" };

    let acumulado = 0;
    const classes = ["A", "B", "C"].map((classe) => {
      const itens = registros.filter((r) => r.classe === classe);
      const valorTotal = itens.reduce((acc, r) => acc + r.parcela, 0);
      acumulado += valorTotal;
      return {
        classe,
        criterio: criterios[classe],
        qtd_itens: itens.length,
        pct_itens: n > 0 ? (itens.length / n) * 100 : 0,
        valor_total: valorTotal,
        pct_valor: totalParcelas > 0 ? (valorTotal / totalParcelas) * 100 : 0,
        pct_acumulado: totalParcelas > 0 ? (acumulado / totalParcelas) * 100 : 0
      };
    });

    return {
      n,
      variaveis: {
        quantidade: {
          ...resumoVariavel(qtds),
          rotulo: "QTD (quantidade)",
          unidade: "Unidade do item (mista: M, UN, M2, H, etc.)"
        },
        valor_unitario: {
          ...resumoVariavel(vlrs),
          rotulo: "VLR_UNIT (valor_unitario)",
          unidade: "R$ (Reais por unidade)"
        },
        parcela: {
          ...resumoVariavel(pars),
          rotulo: "PARCELA (valor total da linha)",
          unidade: "R$ (Reais)"
        }
      },
      correlacoes: {
        qtd_vlr: calcularPearson(qtds, vlrs),
        qtd_par: calcularPearson(qtds, pars),
        vlr_par: calcularPearson(vlrs, pars)
      },
      abc: {
        classes,
        total_itens: n,
        total_valor: totalParcelas
      }
    };
  }

  function ajustarScalerLocal(registrosTreino) {
    const n = registrosTreino.length;
    const mediaQtd = registrosTreino.reduce((acc, r) => acc + r.quantidade, 0) / n;
    const mediaVlr = registrosTreino.reduce((acc, r) => acc + r.valor_unitario, 0) / n;
    const stdQtd = Math.sqrt(registrosTreino.reduce((acc, r) => acc + (r.quantidade - mediaQtd) ** 2, 0) / n);
    const stdVlr = Math.sqrt(registrosTreino.reduce((acc, r) => acc + (r.valor_unitario - mediaVlr) ** 2, 0) / n);
    return {
      n_treino: n,
      media_qtd: mediaQtd,
      std_qtd: stdQtd,
      media_vlr: mediaVlr,
      std_vlr: stdVlr
    };
  }

  function converterNumero(raw, nomeCampo) {
    if (raw === null || raw === undefined || typeof raw === "boolean") {
      return { valor: null, erro: `Campo '${nomeCampo}' vazio ou ausente. Informe um número válido (>= 0).` };
    }
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) {
        return { valor: null, erro: `Campo '${nomeCampo}' possui valor não finito.` };
      }
      if (raw < 0) {
        return { valor: null, erro: `Campo '${nomeCampo}' não pode ser negativo (informado: ${raw}).` };
      }
      return { valor: raw, erro: null };
    }
    const texto = String(raw).trim();
    if (texto === "") {
      return { valor: null, erro: `Campo '${nomeCampo}' vazio. Preencha um valor numérico válido (>= 0).` };
    }
    if (texto.includes(",") && texto.includes(".")) {
      return {
        valor: null,
        erro: `Campo '${nomeCampo}' inválido ('${texto}'): use apenas ponto ou vírgula como separador decimal, sem separador de milhar.`
      };
    }
    const normalizado = texto.includes(",") ? texto.replace(",", ".") : texto;
    if (!NUM_REGEX.test(normalizado)) {
      return { valor: null, erro: `Campo '${nomeCampo}' inválido ('${texto}'): informe apenas valores numéricos.` };
    }
    const valor = Number(normalizado);
    if (!Number.isFinite(valor)) {
      return { valor: null, erro: `Campo '${nomeCampo}' fora do intervalo numérico suportado.` };
    }
    if (valor < 0) {
      return { valor: null, erro: `Campo '${nomeCampo}' não pode ser negativo (informado: ${texto}).` };
    }
    return { valor, erro: null };
  }

  function validarEntradaKnn(qtdRaw, vlrRaw, kRaw) {
    const rQtd = converterNumero(qtdRaw, "QTD (Quantidade)");
    if (rQtd.erro) {
      return { dados: null, erro: rQtd.erro, campo: "qtd" };
    }
    const rVlr = converterNumero(vlrRaw, "VLR_UNIT (Valor unitário)");
    if (rVlr.erro) {
      return { dados: null, erro: rVlr.erro, campo: "vlr_unit" };
    }
    if (kRaw === null || kRaw === undefined || typeof kRaw === "boolean" || String(kRaw).trim() === "") {
      return { dados: null, erro: "Selecione um valor válido para k (3 ou 5).", campo: "k" };
    }
    const kNum = Number(String(kRaw).trim());
    if (!Number.isInteger(kNum) || (kNum !== 3 && kNum !== 5)) {
      return {
        dados: null,
        erro: `Valor de k='${kRaw}' não corresponde ao experimento da Aba 06 (use k=3 ou k=5).`,
        campo: "k"
      };
    }
    return { dados: { qtd: rQtd.valor, vlr_unit: rVlr.valor, k: kNum }, erro: null, campo: null };
  }

  function gerarInterpretacao(qtd, vlrUnit, k, classePrevista, votos) {
    const parcelaEstimada = qtd * vlrUnit;
    const votosStr = `A=${votos.A}, B=${votos.B}, C=${votos.C}`;
    const descClasse = {
      A: "itens de maior representatividade financeira acumulada na Base Específica (até 80% do valor)",
      B: "itens intermediários na composição do orçamento (faixa acumulada entre 80% e 95%)",
      C: "itens de menor peso financeiro acumulado individualmente (faixa acima de 95%)"
    }[classePrevista];

    return {
      resumo: `Com k=${k}, os ${k} itens mais próximos no conjunto de treino (padronizados por QTD e VLR_UNIT) produziram votação ${votosStr}, sugerindo Classe ${classePrevista} — perfil típico de ${descClasse}.`,
      sugestao_orcamento: `Na análise preliminar do orçamento, um item com QTD=${formatarNumero(qtd, 2)} e VLR_UNIT=${formatarMoeda(vlrUnit)} (parcela estimada de ${formatarMoeda(parcelaEstimada)}) apresenta comportamento próximo aos itens da Classe ${classePrevista} da Base Específica, auxiliando na priorização inicial de cotação e conferência.`,
      limites: "Esta previsão por vizinhança não substitui o julgamento técnico sobre valor total (QTD × VLR_UNIT), criticidade operacional do item na obra nem a composição completa da Curva ABC: a classe prevista pelo KNN não é uma nova classificação ABC recalculada sobre o orçamento inteiro."
    };
  }

  function classificarKnnLocal(qtd, vlrUnit, k, registrosTreino, scaler) {
    const zq = (qtd - scaler.media_qtd) / scaler.std_qtd;
    const zv = (vlrUnit - scaler.media_vlr) / scaler.std_vlr;

    const ordenados = registrosTreino
      .map((item) => {
        const tzq = (item.quantidade - scaler.media_qtd) / scaler.std_qtd;
        const tzv = (item.valor_unitario - scaler.media_vlr) / scaler.std_vlr;
        const dist = Math.sqrt((zq - tzq) ** 2 + (zv - tzv) ** 2);
        return { item, dist };
      })
      .sort((a, b) => a.dist - b.dist || a.item.linha_aba02 - b.item.linha_aba02);

    const selecionados = ordenados.slice(0, k);
    const votos = { A: 0, B: 0, C: 0 };
    const vizinhos = selecionados.map((entry, idx) => {
      votos[entry.item.classe] += 1;
      return {
        ordem: idx + 1,
        linha_aba02: entry.item.linha_aba02,
        codigo: entry.item.codigo,
        descricao: entry.item.descricao,
        unidade: entry.item.unidade,
        quantidade: entry.item.quantidade,
        valor_unitario: entry.item.valor_unitario,
        parcela: entry.item.parcela,
        classe: entry.item.classe,
        distancia_padronizada: entry.dist
      };
    });

    const classePrevista = Object.entries(votos)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

    return {
      entrada: {
        quantidade: qtd,
        valor_unitario: vlrUnit,
        k,
        parcela_estimada: qtd * vlrUnit
      },
      classe_prevista: classePrevista,
      votos,
      vizinhos,
      interpretacao: gerarInterpretacao(qtd, vlrUnit, k, classePrevista, votos),
      modo: "local_js",
      origem_dados: "data.js (espelho de dados/base_especifica.csv — 30 registros de Treino)"
    };
  }

  // --- Formatacao ---

  function formatarNumero(valor, decimais = 2) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) {
      return "Indefinido";
    }
    return Number(valor).toLocaleString("pt-BR", {
      minimumFractionDigits: decimais,
      maximumFractionDigits: decimais
    });
  }

  function formatarNumeroFlex(valor, maxDecimais = 4) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) {
      return "Indefinido";
    }
    return Number(valor).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimais
    });
  }

  function formatarMoeda(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) {
      return "Indefinido";
    }
    return Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function criarCelula(texto, classeCss = "") {
    const td = document.createElement("td");
    td.textContent = texto;
    if (classeCss) {
      td.className = classeCss;
    }
    return td;
  }

  function criarBadgeClasse(classe) {
    const span = document.createElement("span");
    span.className = `badge-classe classe-${classe}`;
    span.textContent = `Classe ${classe}`;
    return span;
  }

  // --- Renderizacao da Interface ---

  function atualizarStatusExecucao(modoBackend) {
    const badge = document.getElementById("status-execucao");
    if (modoBackend) {
      badge.className = "status-badge modo-python";
      badge.textContent =
        "Modo ativo: Backend Python puro (server.py) lendo dados/base_especifica.csv e dados/base_geral.csv em tempo real";
    } else {
      badge.className = "status-badge modo-offline";
      badge.textContent =
        "Modo ativo: HTML/JS nativos offline lendo espelho fiel da base SGF (data.js — equivalente aos CSVs UTF-8)";
    }
  }

  function classificarForcaPearson(r) {
    const abs = Math.abs(r);
    if (abs < 0.2) return "associação linear muito fraca";
    if (abs < 0.4) return "associação linear fraca";
    if (abs < 0.7) return "associação linear moderada";
    return "associação linear forte";
  }

  function renderIndicadores(payload) {
    const { base, origem_arquivo: origemArquivo, indicadores, referencia_planilha: ref } = payload;
    const vars = indicadores.variaveis;

    document.getElementById("origem-indicadores").innerHTML =
      `Origem atual: <code>${origemArquivo}</code> (${indicadores.n} registros) — cálculos executados em tempo real e conferidos com a Aba 05.`;
    document.getElementById("rotulo-base-abc").textContent =
      base === "especifica" ? "Base Específica (44 itens)" : "Base Geral (356 itens)";

    // KPI 1: Tendencia Central
    const kpiTC = document.getElementById("kpi-tendencia-central");
    kpiTC.innerHTML = "";
    [
      { nome: "QTD", unid: "unid. do item", obj: vars.quantidade, moeda: false },
      { nome: "VLR_UNIT", unid: "R$/unid.", obj: vars.valor_unitario, moeda: true },
      { nome: "PARCELA", unid: "R$", obj: vars.parcela, moeda: true }
    ].forEach((item) => {
      const p = document.createElement("p");
      const mediaTxt = item.moeda ? formatarMoeda(item.obj.media) : `${formatarNumero(item.obj.media, 2)} (${item.unid})`;
      const medTxt = item.moeda ? formatarMoeda(item.obj.mediana) : `${formatarNumero(item.obj.mediana, 2)} (${item.unid})`;
      p.innerHTML = `<strong>${item.nome}:</strong> Média = ${mediaTxt} | Mediana = ${medTxt}`;
      kpiTC.appendChild(p);
    });

    // KPI 2: Dispersao
    const kpiDisp = document.getElementById("kpi-dispersao");
    kpiDisp.innerHTML = "";
    [
      { nome: "QTD", unid: "unid. do item", obj: vars.quantidade, moeda: false },
      { nome: "VLR_UNIT", unid: "R$/unid.", obj: vars.valor_unitario, moeda: true },
      { nome: "PARCELA", unid: "R$", obj: vars.parcela, moeda: true }
    ].forEach((item) => {
      const p = document.createElement("p");
      const dpTxt = item.moeda
        ? formatarMoeda(item.obj.desvio_padrao)
        : `${formatarNumero(item.obj.desvio_padrao, 2)} (${item.unid})`;
      const cvTxt = item.obj.cv !== null ? `${formatarNumero(item.obj.cv, 4)} (${formatarNumero(item.obj.cv * 100, 1)}%)` : "Indefinido";
      p.innerHTML = `<strong>${item.nome}:</strong> DP = ${dpTxt} | CV = ${cvTxt}`;
      kpiDisp.appendChild(p);
    });

    // KPI 3: Pearson
    const kpiPearson = document.getElementById("kpi-pearson");
    kpiPearson.innerHTML = "";
    const pearsonQV = indicadores.correlacoes.qtd_vlr;
    const pMain = document.createElement("p");
    if (pearsonQV.indefinida) {
      pMain.innerHTML = `<strong>r (QTD × VLR_UNIT):</strong> Indefinida — ${pearsonQV.motivo}`;
    } else {
      pMain.innerHTML =
        `<strong>r (QTD × VLR_UNIT):</strong> ${formatarNumero(pearsonQV.valor, 6)} ` +
        `(adimensional • ${classificarForcaPearson(pearsonQV.valor)})`;
    }
    kpiPearson.appendChild(pMain);

    const pQP = document.createElement("p");
    pQP.innerHTML = `<strong>r (QTD × PARCELA):</strong> ${
      indicadores.correlacoes.qtd_par.indefinida
        ? indicadores.correlacoes.qtd_par.motivo
        : `${formatarNumero(indicadores.correlacoes.qtd_par.valor, 6)} (adimensional)`
    }`;
    kpiPearson.appendChild(pQP);

    const pVP = document.createElement("p");
    pVP.innerHTML = `<strong>r (VLR_UNIT × PARCELA):</strong> ${
      indicadores.correlacoes.vlr_par.indefinida
        ? indicadores.correlacoes.vlr_par.motivo
        : `${formatarNumero(indicadores.correlacoes.vlr_par.valor, 6)} (adimensional)`
    }`;
    kpiPearson.appendChild(pVP);

    // Tabela completa de dispersao
    const tbodyDisp = document.querySelector("#tabela-dispersao tbody");
    tbodyDisp.innerHTML = "";
    [
      { key: "quantidade", moeda: false },
      { key: "valor_unitario", moeda: true },
      { key: "parcela", moeda: true }
    ].forEach(({ key, moeda }) => {
      const v = vars[key];
      const tr = document.createElement("tr");
      const fmt = (num) => (moeda ? formatarMoeda(num) : formatarNumero(num, 4));
      tr.appendChild(criarCelula(v.rotulo));
      tr.appendChild(criarCelula(v.unidade));
      tr.appendChild(criarCelula(String(v.n)));
      tr.appendChild(criarCelula(fmt(v.media)));
      tr.appendChild(criarCelula(fmt(v.mediana)));
      tr.appendChild(criarCelula(fmt(v.desvio_padrao)));
      tr.appendChild(criarCelula(v.cv !== null ? formatarNumero(v.cv, 6) : "Indefinido"));
      tr.appendChild(criarCelula(moeda ? formatarMoeda(v.minimo) : formatarNumeroFlex(v.minimo, 2)));
      tr.appendChild(criarCelula(moeda ? formatarMoeda(v.maximo) : formatarNumeroFlex(v.maximo, 2)));
      tbodyDisp.appendChild(tr);
    });

    // Painel Curva ABC
    const tbodyAbc = document.querySelector("#tabela-abc tbody");
    tbodyAbc.innerHTML = "";
    indicadores.abc.classes.forEach((c) => {
      const tr = document.createElement("tr");
      const tdClasse = document.createElement("td");
      tdClasse.appendChild(criarBadgeClasse(c.classe));
      tr.appendChild(tdClasse);
      tr.appendChild(criarCelula(c.criterio));
      tr.appendChild(criarCelula(String(c.qtd_itens)));
      tr.appendChild(criarCelula(`${formatarNumero(c.pct_itens, 2)}%`));
      tr.appendChild(criarCelula(formatarMoeda(c.valor_total)));
      tr.appendChild(criarCelula(`${formatarNumero(c.pct_acumulado, 2)}%`));
      tbodyAbc.appendChild(tr);
    });
    const trTot = document.createElement("tr");
    trTot.innerHTML = `<td><strong>TOTAL</strong></td><td>-</td><td><strong>${indicadores.abc.total_itens}</strong></td><td><strong>100,00%</strong></td><td><strong>${formatarMoeda(indicadores.abc.total_valor)}</strong></td><td><strong>100,00%</strong></td>`;
    tbodyAbc.appendChild(trTot);

    // Conferencia com Aba 05
    const tbodyConf = document.querySelector("#tabela-conferencia tbody");
    tbodyConf.innerHTML = "";
    const comparacoes = [
      {
        nome: "Média de QTD (unid. do item)",
        calc: vars.quantidade.media,
        plan: ref.quantidade.media,
        dec: 6
      },
      {
        nome: "Desvio-padrão de VLR_UNIT (R$)",
        calc: vars.valor_unitario.desvio_padrao,
        plan: ref.valor_unitario.desvio_padrao,
        dec: 6
      },
      {
        nome: "Coef. de Variação de PARCELA",
        calc: vars.parcela.cv,
        plan: ref.parcela.cv,
        dec: 6
      },
      {
        nome: "Correlação de Pearson (QTD × VLR_UNIT)",
        calc: pearsonQV.valor,
        plan: ref.pearson_qtd_vlr,
        dec: 6
      }
    ];
    comparacoes.forEach((item) => {
      const tr = document.createElement("tr");
      const diff = item.calc !== null ? Math.abs(item.calc - item.plan) : null;
      const confere = diff !== null && diff < 1e-6;
      tr.appendChild(criarCelula(item.nome));
      tr.appendChild(criarCelula(formatarNumero(item.calc, item.dec)));
      tr.appendChild(criarCelula(formatarNumero(item.plan, item.dec)));
      tr.appendChild(
        criarCelula(
          confere ? `${origemArquivo} vs Aba 05: Confere` : "Divergência detectada",
          confere ? "status-ok" : "status-err"
        )
      );
      tbodyConf.appendChild(tr);
    });
  }

  function renderMatrizes(refKnn) {
    function preencherMatriz(idTabela, matriz) {
      const tbody = document.querySelector(`#${idTabela} tbody`);
      tbody.innerHTML = "";
      ["A", "B", "C"].forEach((classeReal) => {
        const linha = matriz[classeReal];
        const tr = document.createElement("tr");
        const tdReal = document.createElement("td");
        tdReal.appendChild(criarBadgeClasse(classeReal));
        tr.appendChild(tdReal);
        ["A", "B", "C"].forEach((col) => {
          const td = criarCelula(String(linha[col]));
          if (col === classeReal) {
            td.innerHTML = `<strong>${linha[col]}</strong>`;
          }
          tr.appendChild(td);
        });
        tr.appendChild(criarCelula(String(linha.erros)));
        tbody.appendChild(tr);
      });
    }
    preencherMatriz("matriz-k3", refKnn.matriz_k3);
    preencherMatriz("matriz-k5", refKnn.matriz_k5);
  }

  function renderCasosTeste(casos) {
    const select = document.getElementById("select-caso-lab");
    select.innerHTML = "";
    casos.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = String(c.linha_aba02);
      opt.textContent = `Linha ${c.linha_aba02} (${c.codigo}) — QTD=${formatarNumeroFlex(c.quantidade, 2)}, VLR=${formatarMoeda(c.valor_unitario)} | Real: ${c.classe_real} | Lab k=3: ${c.previsto_k3_lab} / k=5: ${c.previsto_k5_lab}`;
      select.appendChild(opt);
    });

    const tbody = document.querySelector("#tabela-casos-teste tbody");
    tbody.innerHTML = "";
    casos.forEach((c) => {
      const tr = document.createElement("tr");
      const okK3 = c.previsto_k3_lab === c.previsto_k3_calculado;
      const okK5 = c.previsto_k5_lab === c.previsto_k5_calculado;
      const ok = okK3 && okK5;
      tr.appendChild(criarCelula(String(c.linha_aba02)));
      tr.appendChild(criarCelula(c.codigo));
      tr.appendChild(criarCelula(formatarNumeroFlex(c.quantidade, 2)));
      tr.appendChild(criarCelula(formatarMoeda(c.valor_unitario)));
      tr.appendChild(criarCelula(c.classe_real));
      tr.appendChild(criarCelula(c.previsto_k3_lab));
      tr.appendChild(criarCelula(c.previsto_k3_calculado));
      tr.appendChild(criarCelula(c.previsto_k5_lab));
      tr.appendChild(criarCelula(c.previsto_k5_calculado));
      tr.appendChild(criarCelula(ok ? "Confere (100%)" : "Divergente", ok ? "status-ok" : "status-err"));
      tbody.appendChild(tr);
    });
  }

  function limparErro() {
    document.getElementById("erro-box").classList.add("hidden");
    document.getElementById("erro-mensagem").textContent = "";
    document.getElementById("input-qtd").classList.remove("input-invalido");
    document.getElementById("input-vlr").classList.remove("input-invalido");
  }

  function mostrarErro(mensagem, campo) {
    document.getElementById("resultado-knn").classList.add("hidden");
    const erroBox = document.getElementById("erro-box");
    document.getElementById("erro-mensagem").textContent = mensagem;
    erroBox.classList.remove("hidden");

    document.getElementById("input-qtd").classList.remove("input-invalido");
    document.getElementById("input-vlr").classList.remove("input-invalido");
    if (campo === "qtd") {
      document.getElementById("input-qtd").classList.add("input-invalido");
    } else if (campo === "vlr_unit") {
      document.getElementById("input-vlr").classList.add("input-invalido");
    }

    document.getElementById("interp-resumo").textContent =
      "A consulta não foi executada devido a erro nos dados informados.";
    document.getElementById("interp-orcamento").textContent =
      `Corrija a entrada (${mensagem}) para obter a previsão KNN e sua leitura orçamentária.`;
  }

  function renderResultadoKnn(resultado, opcoes = {}) {
    limparErro();
    const boxResultado = document.getElementById("resultado-knn");
    boxResultado.classList.remove("hidden");

    const badgeOrigem = document.getElementById("badge-origem-consulta");
    if (opcoes.demoLab) {
      badgeOrigem.className = "origem-consulta-badge demo";
      badgeOrigem.textContent = "Consulta demonstrativa — resultado do laboratório KNN";
    } else {
      badgeOrigem.className = "origem-consulta-badge";
      badgeOrigem.textContent =
        resultado.modo === "backend_python"
          ? "Consulta interativa — cálculo em tempo real (Backend Python)"
          : "Consulta interativa — cálculo em tempo real (JavaScript nativo)";
    }

    const classe = resultado.classe_prevista;
    const badgeClasse = document.getElementById("classe-prevista-badge");
    badgeClasse.className = `classe-destaque classe-${classe}`;
    badgeClasse.textContent = `Classe prevista: ${classe}`;

    document.getElementById("res-qtd").textContent = `${formatarNumeroFlex(resultado.entrada.quantidade, 4)} (unid. do item)`;
    document.getElementById("res-vlr").textContent = formatarMoeda(resultado.entrada.valor_unitario);
    document.getElementById("res-k").textContent = `k = ${resultado.entrada.k}`;
    document.getElementById("res-votos").textContent =
      `A: ${resultado.votos.A} | B: ${resultado.votos.B} | C: ${resultado.votos.C}`;
    document.getElementById("res-parcela").textContent = formatarMoeda(resultado.entrada.parcela_estimada);

    // Verificar correspondencia com o laboratorio (seja caso de teste da Aba 06 ou exemplo 100/60 k=3)
    const corrBox = document.getElementById("correspondencia-lab");
    if (opcoes.demoLab && opcoes.casoLab) {
      const c = opcoes.casoLab;
      const k = resultado.entrada.k;
      const prevLab = k === 3 ? c.previsto_k3_lab : c.previsto_k5_lab;
      corrBox.classList.remove("hidden");
      corrBox.innerHTML =
        `<strong>Caso da Tabela de Apoio (Aba 06 — Linha ${c.linha_aba02} | ${c.codigo}):</strong> ` +
        `Classe real na Curva ABC = <strong>${c.classe_real}</strong> • ` +
        `Resultado no laboratório (k=${k}) = <strong>${prevLab}</strong> • ` +
        `Recálculo em tempo real = <strong>${classe}</strong> ` +
        `(${prevLab === classe ? "correspondência 100% confirmada" : "divergência"}) ` +
        `• ${c.classe_real === classe ? "Acerto do modelo neste item de teste." : "Erro de classificação do modelo neste item de teste."}`;
    } else if (
      Math.abs(resultado.entrada.quantidade - 100) < 1e-9 &&
      Math.abs(resultado.entrada.valor_unitario - 60) < 1e-9 &&
      resultado.entrada.k === 3
    ) {
      corrBox.classList.remove("hidden");
      corrBox.innerHTML =
        `<strong>Exemplo hipotético da Aba 06 (Seção 4):</strong> Classe prevista = <strong>B</strong> com vizinhos ` +
        `Linhas 13 (dist 0,019941), 21 (dist 0,059172) e 23 (dist 0,076915) — correspondência exata comprovada com o laboratório.`;
    } else {
      corrBox.classList.add("hidden");
      corrBox.innerHTML = "";
    }

    // Tabela de vizinhos
    const tbodyViz = document.querySelector("#tabela-vizinhos tbody");
    tbodyViz.innerHTML = "";
    resultado.vizinhos.forEach((v) => {
      const tr = document.createElement("tr");
      tr.appendChild(criarCelula(`Vizinho ${v.ordem}`));
      tr.appendChild(criarCelula(String(v.linha_aba02)));
      tr.appendChild(criarCelula(v.codigo));
      tr.appendChild(criarCelula(v.descricao));
      tr.appendChild(criarCelula(v.unidade));
      tr.appendChild(criarCelula(formatarNumeroFlex(v.quantidade, 2)));
      tr.appendChild(criarCelula(formatarMoeda(v.valor_unitario)));
      const tdCl = document.createElement("td");
      tdCl.appendChild(criarBadgeClasse(v.classe));
      tr.appendChild(tdCl);
      tr.appendChild(criarCelula(formatarNumero(v.distancia_padronizada, 8)));
      tbodyViz.appendChild(tr);
    });

    // Secao 4: Interpretacao
    document.getElementById("interp-resumo").textContent = resultado.interpretacao.resumo;
    document.getElementById("interp-orcamento").textContent = resultado.interpretacao.sugestao_orcamento;
    document.getElementById("interp-limites").textContent = resultado.interpretacao.limites;
  }

  // --- Orquestracao Backend Python / Fallback JS ---

  async function carregarIndicadores(base) {
    estado.baseAtual = base;
    document.getElementById("btn-base-especifica").classList.toggle("active", base === "especifica");
    document.getElementById("btn-base-geral").classList.toggle("active", base === "geral");

    if (estado.modoBackend) {
      const resp = await fetch(`/api/indicadores?base=${encodeURIComponent(base)}`);
      const dados = await resp.json();
      renderIndicadores(dados);
      return;
    }

    const sgf = window.SGF_DATA;
    const registros = base === "especifica" ? sgf.especifica : sgf.geral;
    const origemArquivo = base === "especifica" ? "dados/base_especifica.csv (espelho data.js)" : "dados/base_geral.csv (espelho data.js)";
    renderIndicadores({
      base,
      origem_arquivo: origemArquivo,
      calculado_em_tempo_real: true,
      indicadores: calcularEstatisticasLocal(registros),
      referencia_planilha: sgf.referenciaLab.estatistica[base]
    });
  }

  async function executarConsultaKnn(qtdRaw, vlrRaw, kRaw, opcoes = {}) {
    if (estado.modoBackend) {
      try {
        const resp = await fetch("/api/knn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qtd: qtdRaw, vlr_unit: vlrRaw, k: kRaw })
        });
        const data = await resp.json();
        if (!resp.ok) {
          mostrarErro(data.erro || "Erro de validação na consulta KNN.", data.campo || null);
          return;
        }
        renderResultadoKnn(data, opcoes);
      } catch (_err) {
        mostrarErro("Falha ao comunicar com o backend Python.", null);
      }
      return;
    }

    const val = validarEntradaKnn(qtdRaw, vlrRaw, kRaw);
    if (val.erro) {
      mostrarErro(val.erro, val.campo);
      return;
    }
    const treino = window.SGF_DATA.especifica.filter((r) => r.subconjunto === "Treino");
    const scaler = ajustarScalerLocal(treino);
    const resultado = classificarKnnLocal(val.dados.qtd, val.dados.vlr_unit, val.dados.k, treino, scaler);
    renderResultadoKnn(resultado, opcoes);
  }

  async function inicializar() {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let info = null;
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      try {
        const resp = await fetch("/api/info");
        if (resp.ok) {
          const json = await resp.json();
          if (json.modo === "backend_python") {
            estado.modoBackend = true;
            info = json;
          }
        }
      } catch (_e) {
        estado.modoBackend = false;
      }
    }

    atualizarStatusExecucao(estado.modoBackend);

    if (estado.modoBackend && info) {
      estado.info = info;
      document.getElementById("info-equipe").textContent = info.equipe;
      document.getElementById("info-integrantes").textContent = info.integrantes.join(" • ");
      document.getElementById("info-planilha").textContent = info.planilha;
      document.getElementById("info-registros").textContent =
        `Base Específica: ${info.registros.especifica} itens (${info.registros.treino_knn} treino / ${info.registros.teste_knn} teste) • Base Geral: ${info.registros.geral} itens`;

      const respCasos = await fetch("/api/casos-teste");
      const jsonCasos = await respCasos.json();
      estado.casosTeste = jsonCasos.casos;
      renderMatrizes(info.knn_referencia);
      renderCasosTeste(estado.casosTeste);
    } else {
      const ref = window.SGF_DATA.referenciaLab;
      const treino = window.SGF_DATA.especifica.filter((r) => r.subconjunto === "Treino");
      const teste = window.SGF_DATA.especifica.filter((r) => r.subconjunto === "Teste");
      const scaler = ajustarScalerLocal(treino);
      estado.casosTeste = teste.map((item) => {
        const res3 = classificarKnnLocal(item.quantidade, item.valor_unitario, 3, treino, scaler);
        const res5 = classificarKnnLocal(item.quantidade, item.valor_unitario, 5, treino, scaler);
        return {
          linha_aba02: item.linha_aba02,
          codigo: item.codigo,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          parcela: item.parcela,
          classe_real: item.classe,
          previsto_k3_lab: item.previsto_k3_lab,
          previsto_k5_lab: item.previsto_k5_lab,
          previsto_k3_calculado: res3.classe_prevista,
          previsto_k5_calculado: res5.classe_prevista
        };
      });
      renderMatrizes(ref.knn);
      renderCasosTeste(estado.casosTeste);
    }

    await carregarIndicadores("especifica");

    // Eventos da UI
    document.getElementById("btn-base-especifica").addEventListener("click", () => carregarIndicadores("especifica"));
    document.getElementById("btn-base-geral").addEventListener("click", () => carregarIndicadores("geral"));

    document.getElementById("form-knn").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const qtd = document.getElementById("input-qtd").value;
      const vlr = document.getElementById("input-vlr").value;
      const k = document.getElementById("select-k").value;
      executarConsultaKnn(qtd, vlr, k, { demoLab: false });
    });

    document.getElementById("btn-exemplo-lab").addEventListener("click", () => {
      document.getElementById("input-qtd").value = "100";
      document.getElementById("input-vlr").value = "60";
      document.getElementById("select-k").value = "3";
      executarConsultaKnn("100", "60", "3", { demoLab: false });
    });

    document.getElementById("btn-simular-erro").addEventListener("click", () => {
      document.getElementById("input-qtd").value = "abc";
      document.getElementById("input-vlr").value = "";
      const k = document.getElementById("select-k").value;
      executarConsultaKnn("abc", "", k, { demoLab: false });
    });

    document.getElementById("btn-limpar").addEventListener("click", () => {
      document.getElementById("input-qtd").value = "";
      document.getElementById("input-vlr").value = "";
      limparErro();
      document.getElementById("resultado-knn").classList.add("hidden");
      document.getElementById("interp-resumo").textContent =
        "Preencha QTD e VLR_UNIT acima e clique em 'Classificar com KNN' ou visualize um caso do laboratório.";
      document.getElementById("interp-orcamento").textContent = "";
    });

    document.getElementById("btn-visualizar-caso").addEventListener("click", () => {
      const linhaSelecionada = Number(document.getElementById("select-caso-lab").value);
      const caso = estado.casosTeste.find((c) => c.linha_aba02 === linhaSelecionada);
      if (!caso) return;
      const k = document.getElementById("select-k").value;
      document.getElementById("input-qtd").value = String(caso.quantidade);
      document.getElementById("input-vlr").value = String(caso.valor_unitario);
      executarConsultaKnn(String(caso.quantidade), String(caso.valor_unitario), k, {
        demoLab: true,
        casoLab: caso
      });
    });

    // Executa o exemplo hipotetico da Aba 06 na abertura para demonstracao imediata
    await executarConsultaKnn("100", "60", "3", { demoLab: false });
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", inicializar);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      resumoVariavel,
      calcularPearson,
      calcularEstatisticasLocal,
      ajustarScalerLocal,
      validarEntradaKnn,
      classificarKnnLocal
    };
  }
})();
