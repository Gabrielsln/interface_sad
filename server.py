#!/usr/bin/env python3
"""Backend Python puro para o Trabalho Pratico da U2 — Interface do SGF (Dupla 05).

Utiliza exclusivamente a biblioteca padrao do Python 3 (sem dependencias externas).
Le os arquivos CSV UTF-8 em ./dados/, calcula indicadores estatisticos, correlacao de
Pearson, padronizacao (StandardScaler no conjunto de treino) e classificacao KNN,
alem de servir os arquivos estaticos da interface em HTML/CSS/JS nativos.
"""

import csv
import json
import math
import mimetypes
import os
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DADOS_DIR = os.path.join(BASE_DIR, "dados")
CSV_ESPECIFICA = os.path.join(DADOS_DIR, "base_especifica.csv")
CSV_GERAL = os.path.join(DADOS_DIR, "base_geral.csv")

REFERENCIA_LAB = {
    "equipe": "Dupla 05",
    "integrantes": [
        "[Nome do Integrante 1]",
        "[Nome do Integrante 2]",
    ],
    "planilha": "Planilha SGF — Dupla 05 (Abas 01 a 06)",
    "estatistica": {
        "especifica": {
            "aba_origem": "Aba 05 (Dispersao e Correlacao) e Aba 04 (Curva ABC - Base Especifica)",
            "n": 44,
            "quantidade": {
                "media": 260.931818181818,
                "desvio_padrao": 543.384779027267,
                "cv": 2.08247803128645,
                "minimo": 0.0,
                "maximo": 3150.0,
            },
            "valor_unitario": {
                "media": 612.740681818182,
                "desvio_padrao": 1800.59009793052,
                "cv": 2.93858421900051,
                "minimo": 0.49,
                "maximo": 9539.05,
            },
            "parcela": {
                "media": 7699.08431818182,
                "desvio_padrao": 10363.6607886344,
                "cv": 1.34609004919716,
                "minimo": 0.0,
                "maximo": 48084.0,
            },
            "pearson_qtd_vlr": -0.155542103989745,
            "pearson_qtd_par": 0.453185093185661,
            "pearson_vlr_par": -0.10043048475405,
        },
        "geral": {
            "aba_origem": "Aba 05 (Dispersao e Correlacao) e Aba 03 (Curva ABC - Base Geral)",
            "n": 356,
            "quantidade": {
                "media": 301.721320224719,
                "desvio_padrao": 1170.97999815275,
                "cv": 3.88099852300997,
                "minimo": 0.21,
                "maximo": 11500.0,
            },
            "valor_unitario": {
                "media": 1049.65959530337,
                "desvio_padrao": 6756.33037524402,
                "cv": 6.43668709882209,
                "minimo": 0.37,
                "maximo": 109315.63,
            },
            "parcela": {
                "media": 13797.1354744382,
                "desvio_padrao": 47498.1431547749,
                "cv": 3.44260902872007,
                "minimo": 5.91,
                "maximo": 500829.6,
            },
            "pearson_qtd_vlr": -0.0382627948194431,
            "pearson_qtd_par": 0.310381509945311,
            "pearson_vlr_par": 0.214015379651129,
        },
    },
    "knn": {
        "aba_origem": "Aba 06 — KNN — Classificacao ABC por Vizinhanca — Base Especifica (Dupla 05)",
        "atributos": ["quantidade", "valor_unitario"],
        "alvo": "classe",
        "divisao": "test_size = 0,30 | random_state = 42 | stratify = y",
        "padronizacao": "StandardScaler ajustado apenas no treino (ddof = 0)",
        "std_treino_quantidade": 338.088694805898,
        "std_treino_valor_unitario": 1405.17165015702,
        "registros_validos": 44,
        "registros_treino": 30,
        "registros_teste": 14,
        "distribuicao": {
            "A": {"total": 15, "treino": 10, "teste": 5},
            "B": {"total": 12, "treino": 8, "teste": 4},
            "C": {"total": 17, "treino": 12, "teste": 5},
        },
        "matriz_k3": {
            "A": {"A": 4, "B": 0, "C": 1, "erros": 1},
            "B": {"A": 1, "B": 3, "C": 0, "erros": 1},
            "C": {"A": 1, "B": 2, "C": 2, "erros": 3},
            "acertos": 9,
            "teste": 14,
            "acuracia": 0.6428571429,
        },
        "matriz_k5": {
            "A": {"A": 3, "B": 1, "C": 1, "erros": 2},
            "B": {"A": 1, "B": 3, "C": 0, "erros": 1},
            "C": {"A": 1, "B": 1, "C": 3, "erros": 2},
            "acertos": 9,
            "teste": 14,
            "acuracia": 0.6428571429,
        },
        "classe_mais_confundida_k3": "C",
        "exemplo_hipotetico": {
            "quantidade": 100.0,
            "valor_unitario": 60.0,
            "k": 3,
            "classe_prevista": "B",
        },
    },
}


def carregar_base_especifica(caminho=CSV_ESPECIFICA):
    """Carrega os 44 registros da Base Especifica combinada com a Tabela de Apoio KNN."""
    registros = []
    with open(caminho, mode="r", encoding="utf-8", newline="") as f:
        leitor = csv.DictReader(f)
        for linha in leitor:
            registros.append({
                "linha_aba02": int(linha["linha_aba02"]),
                "codigo": linha["codigo"],
                "descricao": linha["descricao"],
                "unidade": linha["unidade"],
                "quantidade": float(linha["quantidade"]),
                "valor_unitario": float(linha["valor_unitario"]),
                "parcela": float(linha["parcela"]),
                "percentual_individual": float(linha["percentual_individual"]),
                "percentual_acumulado": float(linha["percentual_acumulado"]),
                "classe": linha["classe"].strip(),
                "subconjunto": linha["subconjunto"].strip(),
                "previsto_k3_lab": linha["previsto_k3_lab"].strip() or None,
                "previsto_k5_lab": linha["previsto_k5_lab"].strip() or None,
            })
    return registros


def carregar_base_geral(caminho=CSV_GERAL):
    """Carrega os 356 registros da Base Geral."""
    registros = []
    with open(caminho, mode="r", encoding="utf-8", newline="") as f:
        leitor = csv.DictReader(f)
        for linha in leitor:
            registros.append({
                "codigo": linha["codigo"],
                "descricao": linha["descricao"],
                "unidade": linha["unidade"],
                "quantidade": float(linha["quantidade"]),
                "valor_unitario": float(linha["valor_unitario"]),
                "parcela": float(linha["parcela"]),
                "percentual_individual": float(linha["percentual_individual"]),
                "percentual_acumulado": float(linha["percentual_acumulado"]),
                "classe": linha["classe"].strip(),
            })
    return registros


def _resumo_variavel(valores):
    n = len(valores)
    if n == 0:
        return {
            "n": 0,
            "media": None,
            "mediana": None,
            "desvio_padrao": None,
            "cv": None,
            "minimo": None,
            "maximo": None,
        }
    ordenados = sorted(valores)
    media = sum(valores) / n
    if n % 2 == 1:
        mediana = ordenados[n // 2]
    else:
        mediana = (ordenados[n // 2 - 1] + ordenados[n // 2]) / 2.0
    variancia = sum((v - media) ** 2 for v in valores) / n
    desvio_padrao = math.sqrt(variancia)
    cv = (desvio_padrao / media) if media != 0 else None
    return {
        "n": n,
        "media": media,
        "mediana": mediana,
        "desvio_padrao": desvio_padrao,
        "cv": cv,
        "minimo": ordenados[0],
        "maximo": ordenados[-1],
    }


def calcular_pearson(xs, ys):
    """Calcula a correlacao linear de Pearson ou informa motivo caso seja indefinida."""
    n = len(xs)
    if n < 2 or len(ys) != n:
        return {
            "valor": None,
            "indefinida": True,
            "motivo": "Correlacao indefinida: sao necessarios pelo menos 2 registros validos.",
        }
    media_x = sum(xs) / n
    media_y = sum(ys) / n
    num = 0.0
    dx2 = 0.0
    dy2 = 0.0
    for x, y in zip(xs, ys):
        dx = x - media_x
        dy = y - media_y
        num += dx * dy
        dx2 += dx * dx
        dy2 += dy * dy
    denominador = math.sqrt(dx2 * dy2)
    if denominador == 0.0:
        return {
            "valor": None,
            "indefinida": True,
            "motivo": (
                "Correlacao indefinida: desvio-padrao nulo em pelo menos uma das variaveis "
                "(divisao por zero)."
            ),
        }
    return {
        "valor": num / denominador,
        "indefinida": False,
        "motivo": None,
    }


def calcular_estatisticas(registros):
    """Calcula indicadores descritivos, correlacao de Pearson e resumo da Curva ABC."""
    qtds = [r["quantidade"] for r in registros]
    vlrs = [r["valor_unitario"] for r in registros]
    pars = [r["parcela"] for r in registros]

    n = len(registros)
    total_parcelas = sum(pars)
    criterios = {"A": "<= 80%", "B": "> 80% e <= 95%", "C": "> 95%"}
    abc_classes = []
    acumulado = 0.0
    for classe in ("A", "B", "C"):
        itens = [r for r in registros if r["classe"] == classe]
        valor_classe = sum(r["parcela"] for r in itens)
        acumulado += valor_classe
        pct_itens = (len(itens) / n * 100.0) if n > 0 else 0.0
        pct_valor = (valor_classe / total_parcelas * 100.0) if total_parcelas > 0 else 0.0
        pct_acum = (acumulado / total_parcelas * 100.0) if total_parcelas > 0 else 0.0
        abc_classes.append({
            "classe": classe,
            "criterio": criterios[classe],
            "qtd_itens": len(itens),
            "pct_itens": pct_itens,
            "valor_total": valor_classe,
            "pct_valor": pct_valor,
            "pct_acumulado": pct_acum,
        })

    return {
        "n": n,
        "variaveis": {
            "quantidade": {
                **_resumo_variavel(qtds),
                "rotulo": "QTD (quantidade)",
                "unidade": "Unidade do item (mista: M, UN, M2, H, etc.)",
            },
            "valor_unitario": {
                **_resumo_variavel(vlrs),
                "rotulo": "VLR_UNIT (valor_unitario)",
                "unidade": "R$ (Reais por unidade)",
            },
            "parcela": {
                **_resumo_variavel(pars),
                "rotulo": "PARCELA (valor total da linha)",
                "unidade": "R$ (Reais)",
            },
        },
        "correlacoes": {
            "qtd_vlr": calcular_pearson(qtds, vlrs),
            "qtd_par": calcular_pearson(qtds, pars),
            "vlr_par": calcular_pearson(vlrs, pars),
        },
        "abc": {
            "classes": abc_classes,
            "total_itens": n,
            "total_valor": total_parcelas,
        },
    }


def ajustar_standard_scaler(registros_treino):
    """Ajusta media e desvio-padrao populacional (ddof=0) apenas no conjunto de treino."""
    qtds = [r["quantidade"] for r in registros_treino]
    vlrs = [r["valor_unitario"] for r in registros_treino]
    n = len(registros_treino)
    media_qtd = sum(qtds) / n
    media_vlr = sum(vlrs) / n
    std_qtd = math.sqrt(sum((q - media_qtd) ** 2 for q in qtds) / n)
    std_vlr = math.sqrt(sum((v - media_vlr) ** 2 for v in vlrs) / n)
    return {
        "n_treino": n,
        "media_qtd": media_qtd,
        "std_qtd": std_qtd,
        "media_vlr": media_vlr,
        "std_vlr": std_vlr,
    }


_NUM_RE = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")


def _converter_numero(raw, nome_campo):
    if raw is None or isinstance(raw, bool):
        return None, f"Campo '{nome_campo}' vazio ou ausente. Informe um numero valido (>= 0)."
    if isinstance(raw, (int, float)):
        valor = float(raw)
        if not math.isfinite(valor):
            return None, f"Campo '{nome_campo}' possui valor nao finito."
        if valor < 0:
            return None, f"Campo '{nome_campo}' nao pode ser negativo (informado: {valor})."
        return valor, None

    texto = str(raw).strip()
    if texto == "":
        return None, f"Campo '{nome_campo}' vazio. Preencha um valor numerico valido (>= 0)."

    # Aceita virgula decimal brasileira caso nao haja ponto simultaneo
    if "," in texto and "." in texto:
        return None, (
            f"Campo '{nome_campo}' invalido ('{texto}'): use apenas ponto ou virgula "
            "como separador decimal, sem separador de milhar."
        )
    normalizado = texto.replace(",", ".") if "," in texto else texto
    if not _NUM_RE.match(normalizado):
        return None, f"Campo '{nome_campo}' invalido ('{texto}'): informe apenas valores numericos."

    valor = float(normalizado)
    if not math.isfinite(valor):
        return None, f"Campo '{nome_campo}' fora do intervalo numerico suportado."
    if valor < 0:
        return None, f"Campo '{nome_campo}' nao pode ser negativo (informado: {texto})."
    return valor, None


def validar_entrada_knn(qtd_raw, vlr_raw, k_raw):
    """Valida QTD, VLR_UNIT e k antes da classificacao KNN."""
    qtd, err_qtd = _converter_numero(qtd_raw, "QTD (Quantidade)")
    if err_qtd:
        return None, {"erro": err_qtd, "campo": "qtd"}

    vlr, err_vlr = _converter_numero(vlr_raw, "VLR_UNIT (Valor unitario)")
    if err_vlr:
        return None, {"erro": err_vlr, "campo": "vlr_unit"}

    if k_raw is None or isinstance(k_raw, bool) or str(k_raw).strip() == "":
        return None, {"erro": "Selecione um valor valido para k (3 ou 5).", "campo": "k"}

    try:
        k_float = float(str(k_raw).strip())
        if not k_float.is_integer():
            raise ValueError("nao inteiro")
        k = int(k_float)
    except (ValueError, TypeError):
        return None, {"erro": f"Valor de k invalido ('{k_raw}'): utilize 3 ou 5.", "campo": "k"}

    if k not in (3, 5):
        return None, {
            "erro": f"Valor de k={k} nao corresponde ao experimento da Aba 06 (use k=3 ou k=5).",
            "campo": "k",
        }

    return {"qtd": qtd, "vlr_unit": vlr, "k": k}, None


def gerar_interpretacao(qtd, vlr_unit, k, classe_prevista, votos, vizinhos):
    """Gera conclusao curta coerente com as regras tecnicas da U2."""
    parcela_estimada = qtd * vlr_unit
    votos_str = f"A={votos['A']}, B={votos['B']}, C={votos['C']}"
    desc_classe = {
        "A": "itens de maior representatividade financeira acumulada na Base Especifica (ate 80% do valor)",
        "B": "itens intermediarios na composicao do orcamento (faixa acumulada entre 80% e 95%)",
        "C": "itens de menor peso financeiro acumulado individualmente (faixa acima de 95%)",
    }[classe_prevista]

    return {
        "resumo": (
            f"Com k={k}, os {k} itens mais proximos no conjunto de treino (padronizados por QTD e VLR_UNIT) "
            f"produziram votacao {votos_str}, sugerindo Classe {classe_prevista} — perfil tipico de {desc_classe}."
        ),
        "sugestao_orcamento": (
            f"Na analise preliminar do orcamento, um item com QTD={qtd:g} e VLR_UNIT=R$ {vlr_unit:.2f} "
            f"(parcela estimada de R$ {parcela_estimada:.2f}) apresenta comportamento proximo aos itens da Classe {classe_prevista} "
            f"da Base Especifica, auxiliando na priorizacao inicial de cotacao e conferencia."
        ),
        "limites": (
            "Esta previsao por vizinhanca nao substitui o julgamento tecnico sobre valor total (QTD x VLR_UNIT), "
            "criticidade operacional do item na obra nem a composicao completa da Curva ABC: a classe prevista pelo KNN "
            "nao e uma nova classificacao ABC recalculada sobre o orcamento inteiro."
        ),
    }


def classificar_knn(qtd, vlr_unit, k, registros_treino, scaler):
    """Executa KNN (distancia Euclidiana padronizada) usando apenas o treino."""
    zq = (qtd - scaler["media_qtd"]) / scaler["std_qtd"]
    zv = (vlr_unit - scaler["media_vlr"]) / scaler["std_vlr"]

    distancias = []
    for item in registros_treino:
        tzq = (item["quantidade"] - scaler["media_qtd"]) / scaler["std_qtd"]
        tzv = (item["valor_unitario"] - scaler["media_vlr"]) / scaler["std_vlr"]
        dist = math.sqrt((zq - tzq) ** 2 + (zv - tzv) ** 2)
        distancias.append((dist, item["linha_aba02"], item))

    distancias.sort(key=lambda t: (t[0], t[1]))
    selecionados = distancias[:k]

    votos = {"A": 0, "B": 0, "C": 0}
    vizinhos = []
    for ordem, (dist, _linha, item) in enumerate(selecionados, start=1):
        votos[item["classe"]] += 1
        vizinhos.append({
            "ordem": ordem,
            "linha_aba02": item["linha_aba02"],
            "codigo": item["codigo"],
            "descricao": item["descricao"],
            "unidade": item["unidade"],
            "quantidade": item["quantidade"],
            "valor_unitario": item["valor_unitario"],
            "parcela": item["parcela"],
            "classe": item["classe"],
            "distancia_padronizada": dist,
        })

    # Desempate deterministico A < B < C (consistente com scikit-learn)
    classe_prevista = sorted(votos.items(), key=lambda par: (-par[1], par[0]))[0][0]
    interpretacao = gerar_interpretacao(qtd, vlr_unit, k, classe_prevista, votos, vizinhos)

    return {
        "entrada": {
            "quantidade": qtd,
            "valor_unitario": vlr_unit,
            "k": k,
            "parcela_estimada": qtd * vlr_unit,
        },
        "classe_prevista": classe_prevista,
        "votos": votos,
        "vizinhos": vizinhos,
        "interpretacao": interpretacao,
        "scaler_aplicado": {
            "media_qtd_treino": scaler["media_qtd"],
            "std_qtd_treino": scaler["std_qtd"],
            "media_vlr_treino": scaler["media_vlr"],
            "std_vlr_treino": scaler["std_vlr"],
        },
    }


# Dados carregados na inicializacao do servidor
BASE_ESPECIFICA = carregar_base_especifica()
BASE_GERAL = carregar_base_geral()
TREINO_KNN = [r for r in BASE_ESPECIFICA if r["subconjunto"] == "Treino"]
TESTE_KNN = [r for r in BASE_ESPECIFICA if r["subconjunto"] == "Teste"]
SCALER_KNN = ajustar_standard_scaler(TREINO_KNN)


class SGFRequestHandler(BaseHTTPRequestHandler):
    """Manipulador HTTP para API REST em Python puro e arquivos estaticos locais."""

    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        # Log conciso no terminal
        print(f"[SGF Server] {self.address_string()} - {format % args}")

    def _enviar_json(self, status, payload):
        corpo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def _servir_arquivo_estatico(self, caminho_rel):
        caminho_decodificado = unquote(caminho_rel)
        if caminho_decodificado in ("", "/"):
            caminho_decodificado = "/index.html"

        caminho_limpo = os.path.normpath(caminho_decodificado.lstrip("/\\"))
        if os.path.isabs(caminho_limpo):
            self._enviar_json(HTTPStatus.FORBIDDEN, {"erro": "Acesso negado."})
            return

        caminho_abs = os.path.abspath(os.path.join(BASE_DIR, caminho_limpo))
        try:
            dentro_da_base = os.path.commonpath([BASE_DIR, caminho_abs]) == BASE_DIR
        except ValueError:
            dentro_da_base = False

        if not dentro_da_base:
            self._enviar_json(HTTPStatus.FORBIDDEN, {"erro": "Acesso negado."})
            return

        if not os.path.isfile(caminho_abs):
            self._enviar_json(HTTPStatus.NOT_FOUND, {"erro": "Arquivo nao encontrado."})
            return

        mime, _ = mimetypes.guess_type(caminho_abs)
        if caminho_abs.endswith(".js"):
            mime = "application/javascript"
        elif caminho_abs.endswith(".css"):
            mime = "text/css"
        elif caminho_abs.endswith(".csv"):
            mime = "text/csv"
        elif mime is None:
            mime = "application/octet-stream"

        if mime.startswith("text/") or mime == "application/javascript":
            content_type = f"{mime}; charset=utf-8"
        else:
            content_type = mime

        with open(caminho_abs, "rb") as f:
            conteudo = f.read()

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(conteudo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(conteudo)

    def do_GET(self):
        parsed = urlparse(self.path)
        rota = parsed.path

        if rota == "/api/info":
            self._enviar_json(
                HTTPStatus.OK,
                {
                    "modo": "backend_python",
                    "equipe": REFERENCIA_LAB["equipe"],
                    "integrantes": REFERENCIA_LAB["integrantes"],
                    "planilha": REFERENCIA_LAB["planilha"],
                    "registros": {
                        "especifica": len(BASE_ESPECIFICA),
                        "geral": len(BASE_GERAL),
                        "treino_knn": len(TREINO_KNN),
                        "teste_knn": len(TESTE_KNN),
                    },
                    "arquivos_csv": {
                        "especifica": "dados/base_especifica.csv",
                        "geral": "dados/base_geral.csv",
                    },
                    "knn_referencia": REFERENCIA_LAB["knn"],
                    "scaler_treino": SCALER_KNN,
                },
            )
            return

        if rota == "/api/indicadores":
            params = parse_qs(parsed.query)
            base = params.get("base", ["especifica"])[0].strip().lower()
            if base == "especifica":
                calculado = calcular_estatisticas(BASE_ESPECIFICA)
                origem_arquivo = "dados/base_especifica.csv"
                ref = REFERENCIA_LAB["estatistica"]["especifica"]
            elif base == "geral":
                calculado = calcular_estatisticas(BASE_GERAL)
                origem_arquivo = "dados/base_geral.csv"
                ref = REFERENCIA_LAB["estatistica"]["geral"]
            else:
                self._enviar_json(
                    HTTPStatus.BAD_REQUEST,
                    {"erro": "Parametro 'base' invalido. Utilize 'especifica' ou 'geral'."},
                )
                return

            self._enviar_json(
                HTTPStatus.OK,
                {
                    "base": base,
                    "origem_arquivo": origem_arquivo,
                    "calculado_em_tempo_real": True,
                    "indicadores": calculado,
                    "referencia_planilha": ref,
                },
            )
            return

        if rota == "/api/casos-teste":
            casos = []
            for item in TESTE_KNN:
                res_k3 = classificar_knn(
                    item["quantidade"], item["valor_unitario"], 3, TREINO_KNN, SCALER_KNN
                )
                res_k5 = classificar_knn(
                    item["quantidade"], item["valor_unitario"], 5, TREINO_KNN, SCALER_KNN
                )
                casos.append({
                    "linha_aba02": item["linha_aba02"],
                    "codigo": item["codigo"],
                    "descricao": item["descricao"],
                    "unidade": item["unidade"],
                    "quantidade": item["quantidade"],
                    "valor_unitario": item["valor_unitario"],
                    "parcela": item["parcela"],
                    "classe_real": item["classe"],
                    "previsto_k3_lab": item["previsto_k3_lab"],
                    "previsto_k5_lab": item["previsto_k5_lab"],
                    "previsto_k3_calculado": res_k3["classe_prevista"],
                    "previsto_k5_calculado": res_k5["classe_prevista"],
                    "acerto_k3": int(res_k3["classe_prevista"] == item["classe"]),
                    "acerto_k5": int(res_k5["classe_prevista"] == item["classe"]),
                    "vizinhos_k3": res_k3["vizinhos"],
                    "vizinhos_k5": res_k5["vizinhos"],
                    "votos_k3": res_k3["votos"],
                    "votos_k5": res_k5["votos"],
                    "interpretacao_k3": res_k3["interpretacao"],
                    "interpretacao_k5": res_k5["interpretacao"],
                })

            self._enviar_json(
                HTTPStatus.OK,
                {
                    "rotulo": "Consulta demonstrativa — resultado do laboratorio KNN",
                    "origem": "dados/base_especifica.csv (Aba 04 + Aba 06 Tabela de Apoio)",
                    "total_casos_teste": len(casos),
                    "casos": casos,
                },
            )
            return

        self._servir_arquivo_estatico(rota)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/knn":
            self._enviar_json(HTTPStatus.NOT_FOUND, {"erro": "Rota POST nao encontrada."})
            return

        try:
            tamanho = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._enviar_json(HTTPStatus.BAD_REQUEST, {"erro": "Content-Length invalido."})
            return

        corpo_bytes = self.rfile.read(tamanho)
        try:
            dados = json.loads(corpo_bytes.decode("utf-8"))
        except Exception:
            self._enviar_json(
                HTTPStatus.BAD_REQUEST,
                {"erro": "Corpo da requisicao deve ser JSON valido."},
            )
            return

        if not isinstance(dados, dict):
            self._enviar_json(
                HTTPStatus.BAD_REQUEST,
                {"erro": "Payload JSON deve ser um objeto com 'qtd', 'vlr_unit' e 'k'."},
            )
            return

        qtd_raw = dados.get("qtd", dados.get("quantidade"))
        vlr_raw = dados.get("vlr_unit", dados.get("valor_unitario"))
        k_raw = dados.get("k")

        validado, erro = validar_entrada_knn(qtd_raw, vlr_raw, k_raw)
        if erro:
            self._enviar_json(HTTPStatus.BAD_REQUEST, erro)
            return

        resultado = classificar_knn(
            validado["qtd"],
            validado["vlr_unit"],
            validado["k"],
            TREINO_KNN,
            SCALER_KNN,
        )
        resultado["modo"] = "backend_python"
        resultado["origem_dados"] = "dados/base_especifica.csv (30 registros de Treino)"
        self._enviar_json(HTTPStatus.OK, resultado)


def main():
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    servidor = ThreadingHTTPServer((host, port), SGFRequestHandler)
    print(f"Servidor Python SGF U2 ativo em http://{host}:{port}")
    print(f"Base Especifica carregada: {len(BASE_ESPECIFICA)} registros ({len(TREINO_KNN)} treino / {len(TESTE_KNN)} teste)")
    print(f"Base Geral carregada: {len(BASE_GERAL)} registros")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
        servidor.server_close()


if __name__ == "__main__":
    main()
