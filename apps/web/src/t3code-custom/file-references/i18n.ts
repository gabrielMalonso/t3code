export const fileReferenceCopy = {
  chip: {
    workspaceBadge: "Workspace",
    externalBadge: "Externo",
    remove: "Remover referência de arquivo",
  },
  tooltip: {
    workspace:
      "Arquivo referenciado por caminho dentro do workspace. O modelo recebe a referência do path, não o conteúdo.",
    external:
      "Arquivo referenciado fora do workspace. O modelo recebe apenas o path e pode não conseguir acessar esse arquivo.",
  },
  error: {
    unsupportedType: (name: string) =>
      `'${name}' não pode ser referenciado nesta versão. Use PDF ou arquivos de texto/código compatíveis.`,
    unavailableOnWeb: "Referências por path estão disponíveis apenas no app desktop por enquanto.",
    unresolvedPath: (name: string) =>
      `Não foi possível resolver o caminho real de '${name}' no desktop.`,
    pendingUserInput: "Adicione referências de arquivo depois de responder as perguntas pendentes.",
  },
  paste: {
    savedTitle: "Texto grande colado salvo como arquivo do workspace",
    savedDescription: (relativePath: string) =>
      `Referência adicionada ao composer: ${relativePath}`,
    writeFailed: "Não foi possível salvar o texto colado como arquivo.",
    restoredText: "O texto original foi mantido no composer.",
    restoreAction: "Colar texto original",
  },
  timeline: {
    header: "Arquivos referenciados",
  },
} as const;
