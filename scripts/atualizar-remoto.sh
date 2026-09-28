#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

remote="subrepl-8cby4dvz"
branch="main"

if [[ "$(git branch --show-current)" != "$branch" ]]; then
  echo "Atualização cancelada: abra a branch main antes de continuar." >&2
  exit 1
fi

if [[ -d "$(git rev-parse --git-path rebase-merge)" ||
      -d "$(git rev-parse --git-path rebase-apply)" ||
      -f "$(git rev-parse --git-path MERGE_HEAD)" ]]; then
  echo "Atualização cancelada: há um rebase ou merge em andamento." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Atualização cancelada: há alterações locais não commitadas. Salve-as antes de atualizar." >&2
  exit 1
fi

echo "Buscando atualizações de ${remote}/${branch}..."
git fetch --quiet "$remote" "$branch"
remote_tip="$(git rev-parse "refs/remotes/${remote}/${branch}")"

if git merge-base --is-ancestor "$remote_tip" HEAD; then
  echo "Já está atualizado. Nenhum commit remoto novo para integrar."
  exit 0
fi

echo "Integrando os commits remotos por merge (sem rebase e sem push)..."
if ! git merge --no-ff --no-edit "$remote_tip"; then
  echo "O merge encontrou um conflito. Desfazendo somente este merge..." >&2
  if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
    git merge --abort || {
      echo "Não foi possível desfazer o merge; peça ajuda antes de continuar." >&2
      exit 1
    }
  fi
  echo "Nada foi enviado ao remoto. Peça ajuda para resolver o conflito." >&2
  exit 1
fi

echo "Atualização concluída. A branch remota foi integrada; nenhum push foi feito."
echo "Se o código do servidor mudou, reinicie o workflow Start application."