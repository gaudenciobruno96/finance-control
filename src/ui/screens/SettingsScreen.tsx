/**
 * UI-09 — Ajustes: ancora de saldo e backup (RF-27 a RF-30).
 */

import { useState } from 'react'

import type { Centavos } from '../../domain/types.js'
import type { ResumoBackup } from '../../data/backup-validator.js'
import type { DocumentoBackup } from '../../data/backup-serializer.js'
import { MoneyInput } from '../components/MoneyInput.js'
import { ConfirmSheet } from '../components/ConfirmSheet.js'
import { useAgora } from '../hooks/useAgora.js'
import { useApp } from '../hooks/useApp.js'
import { useAcao, useErro } from '../hooks/useErro.js'
import estilos from './SettingsScreen.module.css'

interface Pendente {
  readonly documento: DocumentoBackup
  readonly resumo: ResumoBackup
}

export function SettingsScreen() {
  const agora = useAgora()
  const { regras, backup } = useApp()
  const executar = useAcao()
  const { reportar } = useErro()

  const [saldo, setSaldo] = useState<Centavos>(0)
  const [data, setData] = useState(agora)
  const [salvo, setSalvo] = useState(false)
  const [pendente, setPendente] = useState<Pendente | null>(null)

  const declararSaldo = () => {
    void executar(async () => {
      await regras.definirAncora(data, saldo, agora)
      setSalvo(true)
    })
  }

  const exportar = () => {
    void executar(async () => {
      const conteudo = await backup.gerarConteudo(agora)
      const blob = new Blob([conteudo], { type: 'application/json' })
      const nome = `orcamento-${agora}.json`

      // No iOS a folha de compartilhamento e o caminho natural: salva no
      // iCloud Drive, manda por e-mail, o que o usuario preferir.
      const arquivo =
        typeof File === 'function'
          ? new File([blob], nome, { type: 'application/json' })
          : null

      if (
        arquivo !== null &&
        typeof navigator !== 'undefined' &&
        navigator.canShare?.({ files: [arquivo] }) === true
      ) {
        try {
          await navigator.share({ files: [arquivo], title: nome })
        } catch (e) {
          // Fechar a folha de compartilhamento rejeita com AbortError. E uma
          // acao rotineira do usuario, nao uma falha: reporta-la exibiria
          // 'nao foi possivel salvar' e sugeriria problema de armazenamento.
          if (e instanceof DOMException && e.name === 'AbortError') return
          throw e
        }
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = nome
        link.rel = 'noopener'

        // O elemento precisa estar no documento para o clique valer em alguns
        // navegadores, e a URL so pode ser revogada DEPOIS de o download
        // comecar: revogar logo apos o clique aborta a transferencia.
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }

      // Registrar a exportacao SO depois de o arquivo sair.
      //
      // Antes a data era gravada dentro de `exportar`, antes mesmo de o
      // download acontecer: se ele falhasse, o lembrete de backup calava por
      // 14 dias sem existir arquivo nenhum -- exatamente a falha que o
      // lembrete existe para evitar.
      await backup.registrarExportacao(agora)
    })
  }

  /**
   * Fluxo em dois passos (RN-76): validar e exibir o resumo; so entao oferecer
   * a confirmacao. O botao de confirmar nao existe antes do resumo.
   */
  const escolherArquivo = async (arquivo: File) => {
    try {
      const conteudo = await arquivo.text()
      const resultado = backup.validarImportacao(conteudo)

      if (!resultado.valido) {
        reportar(new Error(resultado.erro))
        return
      }
      setPendente({ documento: resultado.documento, resumo: resultado.resumo })
    } catch (e) {
      reportar(e)
    }
  }

  const confirmarImportacao = () => {
    if (pendente === null) return
    void executar(async () => {
      await backup.confirmarImportacao(pendente.documento)
      setPendente(null)
    })
  }

  return (
    <div className={estilos.tela}>
      <section className={estilos.secao}>
        <h2 className={estilos.titulo}>Saldo atual</h2>
        <p className={estilos.nota}>
          Informe quanto você tem hoje. Sem isso, a curva mostra a forma correta, mas
          os valores são relativos.
        </p>

        <label className={estilos.rotulo} htmlFor="ancora-data">
          Data
        </label>
        <input
          id="ancora-data"
          data-testid="ancora-data"
          className={estilos.entrada}
          type="date"
          value={data}
          max={agora}
          onChange={(e) => setData(e.target.value)}
        />

        <MoneyInput
          id="ancora-saldo"
          rotulo="Saldo"
          valorCentavos={saldo}
          onChange={setSaldo}
        />

        <button
          type="button"
          className={estilos.principal}
          onClick={declararSaldo}
          data-testid="salvar-ancora"
        >
          Salvar saldo
        </button>

        {salvo && (
          <p className={estilos.confirmacao} role="status" data-testid="ancora-salva">
            Saldo registrado.
          </p>
        )}
      </section>

      <section className={estilos.secao}>
        <h2 className={estilos.titulo}>Backup</h2>
        <p className={estilos.nota}>
          Seus dados ficam só neste aparelho. O backup é a única forma de recuperá-los
          se você trocar de iPhone ou limpar os dados do Safari.
        </p>

        <button
          type="button"
          className={estilos.principal}
          onClick={exportar}
          data-testid="exportar-backup"
        >
          Exportar backup
        </button>

        <label className={estilos.rotulo} htmlFor="importar-arquivo">
          Importar backup
        </label>
        <input
          id="importar-arquivo"
          data-testid="importar-arquivo"
          className={estilos.entrada}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const arquivo = e.target.files?.[0]
            // Limpar o campo permite escolher o MESMO arquivo de novo: sem
            // isso, cancelar a confirmacao e reselecionar nao dispara evento
            // algum, e a importacao parece morta.
            e.target.value = ''
            if (arquivo !== undefined) void escolherArquivo(arquivo)
          }}
        />

        {pendente !== null && (
          <div className={estilos.resumo} data-testid="resumo-importacao">
            <h3>O que será aplicado</h3>
            <ul>
              <li>{pendente.resumo.quantidadeRegras} regras</li>
              <li>{pendente.resumo.quantidadeParcelamentos} parcelamentos</li>
              <li>{pendente.resumo.quantidadeCartoes} cartões</li>
              <li>{pendente.resumo.quantidadeOcorrencias} lançamentos</li>
              {pendente.resumo.competenciaInicial !== null && (
                <li>
                  período de {pendente.resumo.competenciaInicial} a{' '}
                  {pendente.resumo.competenciaFinal}
                </li>
              )}
              {pendente.resumo.migrado && <li>migrado de uma versão anterior</li>}
            </ul>
          </div>
        )}
      </section>

      <section className={estilos.secao}>
        <h2 className={estilos.titulo}>Sobre</h2>
        <p className={estilos.nota}>
          Nenhum dado sai deste aparelho. Não há conta, servidor nem sincronização.
        </p>
      </section>

      {pendente !== null && (
        <ConfirmSheet
          titulo="Importar backup?"
          mensagem={`Todos os dados atuais serão substituídos por ${pendente.resumo.quantidadeOcorrencias} lançamentos do arquivo. Esta ação não pode ser desfeita.`}
          rotuloConfirmar="Substituir tudo"
          destrutivo
          onConfirmar={confirmarImportacao}
          onCancelar={() => setPendente(null)}
        />
      )}
    </div>
  )
}

