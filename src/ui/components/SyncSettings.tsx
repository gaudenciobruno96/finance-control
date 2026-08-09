/**
 * UI-17 — Configuracao do backup no GitHub.
 *
 * O texto explica MAIS do que um formulario costuma explicar, de proposito:
 * quem cola um token aqui precisa saber exatamente o que esta autorizando, e
 * a diferenca entre um repositorio privado e um publico e a diferenca entre
 * um backup e uma publicacao das proprias financas.
 */

import { useState } from 'react'
import {
  apagarCredencial,
  gravarCredencial,
  lerCredencial,
  CAMINHO_PADRAO,
} from '../../data/sync-credentials.js'
import { useApp } from '../hooks/useApp.js'
import { useAgora } from '../hooks/useAgora.js'
import { useErro } from '../hooks/useErro.js'
import { useSync, type EstadoSync } from '../hooks/useSync.js'
import { ConfirmSheet } from './ConfirmSheet.js'
import estilos from './SyncSettings.module.css'

function rotularEstado(e: EstadoSync): string {
  switch (e.tipo) {
    case 'desligado':
      return 'desligado'
    case 'aguardando':
      return 'aguardando alterações…'
    case 'enviando':
      return 'enviando…'
    case 'salvo':
      return 'salvo no GitHub'
    case 'offline':
      return 'sem internet — envia quando voltar'
    case 'conflito':
      return 'o arquivo mudou em outro aparelho'
    case 'erro':
      return e.mensagem
  }
}

export function SyncSettings() {
  const { sync, backup } = useApp()
  const agora = useAgora()
  const { reportar } = useErro()
  const { estado, credencial, enviarAgora, recarregarCredencial } = useSync()

  const [repositorio, setRepositorio] = useState(credencial?.repositorio ?? '')
  const [token, setToken] = useState('')
  const [caminho, setCaminho] = useState(credencial?.caminho ?? CAMINHO_PADRAO)
  const [aviso, setAviso] = useState<string | null>(null)
  const [testando, setTestando] = useState(false)
  const [restaurando, setRestaurando] = useState<string | null>(null)

  const ligado = credencial !== null && credencial.ativo

  const conectar = () => {
    void (async () => {
      const alvo = {
        repositorio: repositorio.trim(),
        // Um token ja gravado nao precisa ser redigitado para mudar o caminho.
        token: token.trim() !== '' ? token.trim() : (credencial?.token ?? ''),
        caminho: caminho.trim() === '' ? CAMINHO_PADRAO : caminho.trim(),
        ativo: true,
      }

      if (alvo.repositorio === '' || alvo.token === '') {
        setAviso('Informe o repositório e o token.')
        return
      }

      setTestando(true)
      const r = await sync.testar(alvo)
      setTestando(false)
      setAviso(r.mensagem)

      if (!r.ok) return

      gravarCredencial(alvo)
      setToken('')
      recarregarCredencial()
      await enviarAgora()
    })()
  }

  const desconectar = () => {
    apagarCredencial()
    recarregarCredencial()
    setAviso('Desconectado. O arquivo no GitHub continua lá.')
  }

  const restaurar = () => {
    void (async () => {
      const c = lerCredencial()
      if (c === null) return

      try {
        const conteudo = await sync.baixar(c)
        if (conteudo === null) {
          setAviso('Ainda não há backup neste repositório.')
          return
        }
        setRestaurando(conteudo)
      } catch (e) {
        reportar(e)
      }
    })()
  }

  const confirmarRestauracao = () => {
    if (restaurando === null) return

    void (async () => {
      try {
        const resultado = backup.validarImportacao(restaurando)
        if (!resultado.valido) {
          reportar(new Error(resultado.erro))
          setRestaurando(null)
          return
        }
        await backup.confirmarImportacao(resultado.documento)
        await backup.registrarExportacao(agora)
        setRestaurando(null)
        setAviso('Dados restaurados do GitHub.')
      } catch (e) {
        reportar(e)
        setRestaurando(null)
      }
    })()
  }

  return (
    <section className={estilos.secao} data-testid="sync">
      <h2 className={estilos.titulo}>Backup automático no GitHub</h2>

      <p className={estilos.nota}>
        Grava uma cópia dos seus dados num repositório <strong>privado</strong>{' '}
        seu, a cada alteração. Cada envio é um commit, então dá para voltar a
        qualquer estado anterior pelo próprio GitHub.
      </p>

      {ligado ? (
        <>
          <ul className={estilos.estado}>
            <li>
              <span>Repositório</span>
              <strong data-testid="sync-repo">{credencial.repositorio}</strong>
            </li>
            <li>
              <span>Arquivo</span>
              <strong>{credencial.caminho}</strong>
            </li>
            <li>
              <span>Situação</span>
              <strong data-testid="sync-estado">{rotularEstado(estado)}</strong>
            </li>
          </ul>

          {estado.tipo === 'conflito' && (
            <p className={estilos.alerta}>
              O arquivo no GitHub foi alterado por outro aparelho depois do seu
              último envio. Enviar por cima apagaria o que o outro gravou.
              Restaure primeiro, ou force o envio se souber que esta é a versão
              boa.
            </p>
          )}

          <div className={estilos.acoes}>
            <button
              type="button"
              onClick={() => void enviarAgora()}
              data-testid="sync-enviar"
            >
              {estado.tipo === 'conflito' ? 'Enviar mesmo assim' : 'Enviar agora'}
            </button>
            <button type="button" onClick={restaurar} data-testid="sync-restaurar">
              Restaurar do GitHub
            </button>
            <button
              type="button"
              className={estilos.desligar}
              onClick={desconectar}
              data-testid="sync-desconectar"
            >
              Desconectar
            </button>
          </div>
        </>
      ) : (
        <>
          <ol className={estilos.passos}>
            <li>
              Crie um repositório <strong>privado</strong> no GitHub — pode ser
              vazio. Ex.: <code>orcamento-backup</code>.
            </li>
            <li>
              Em <em>Settings › Developer settings › Personal access tokens ›
              Fine-grained tokens</em>, gere um token com acesso só a esse
              repositório e permissão <strong>Contents: Read and write</strong>.
            </li>
            <li>Cole os dois campos abaixo.</li>
          </ol>

          <label className={estilos.rotulo} htmlFor="sync-repositorio">
            Repositório (dono/nome)
          </label>
          <input
            id="sync-repositorio"
            data-testid="sync-repositorio"
            className={estilos.entrada}
            value={repositorio}
            placeholder="seu-usuario/orcamento-backup"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setRepositorio(e.target.value)}
          />

          <label className={estilos.rotulo} htmlFor="sync-token">
            Token de acesso
          </label>
          <input
            id="sync-token"
            data-testid="sync-token"
            className={estilos.entrada}
            type="password"
            value={token}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setToken(e.target.value)}
          />

          <label className={estilos.rotulo} htmlFor="sync-caminho">
            Nome do arquivo
          </label>
          <input
            id="sync-caminho"
            data-testid="sync-caminho"
            className={estilos.entrada}
            value={caminho}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setCaminho(e.target.value)}
          />

          <button
            type="button"
            className={estilos.principal}
            onClick={conectar}
            disabled={testando}
            data-testid="sync-conectar"
          >
            {testando ? 'Verificando…' : 'Conectar'}
          </button>

          <p className={estilos.nota}>
            O token fica guardado só neste aparelho e nunca entra no arquivo de
            backup. Se o iPhone apagar os dados do site, o token some junto — é
            só colar de novo e restaurar.
          </p>
        </>
      )}

      {aviso !== null && (
        <p className={estilos.aviso} role="status" data-testid="sync-aviso">
          {aviso}
        </p>
      )}

      {restaurando !== null && (
        <ConfirmSheet
          titulo="Restaurar do GitHub?"
          mensagem="Todos os dados deste aparelho serão substituídos pelo que está no repositório. Esta ação não pode ser desfeita."
          rotuloConfirmar="Substituir tudo"
          destrutivo
          onConfirmar={confirmarRestauracao}
          onCancelar={() => setRestaurando(null)}
        />
      )}
    </section>
  )
}
