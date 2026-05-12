/**
 * HORIZON CLI — Shell completions (bash / zsh / fish).
 * Scripts estáticos; o usuário escolhe como instalar.
 */

const COMMANDS = [
    'search', 'url', 'batch', 'playlist', 'config', 'history',
    'doctor', 'health', 'stats', 'logs', 'update', 'subs', 'sync',
    'export', 'lyrics', 'queue', 'completion',
    'antiban', 'scan', 'backup', 'restore',
    'bot', 'schedule', 'cleanup',
];

export const BASH = `# Horizon CLI — bash completion
# Instale: horizon completion bash > ~/.horizon-completion.bash
# Adicione ao ~/.bashrc:   source ~/.horizon-completion.bash

_horizon_completion() {
    local cur prev cmds
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    cmds="${COMMANDS.join(' ')}"
    if [ "\${COMP_CWORD}" -eq 1 ]; then
        COMPREPLY=( \$(compgen -W "\${cmds}" -- "\${cur}") )
        return 0
    fi
    case "\${COMP_WORDS[1]}" in
        subs)    COMPREPLY=( \$(compgen -W "add list remove" -- "\${cur}") ) ;;
        queue)   COMPREPLY=( \$(compgen -W "run retry clear list" -- "\${cur}") ) ;;
        antiban) COMPREPLY=( \$(compgen -W "status reset test" -- "\${cur}") ) ;;
        update)  COMPREPLY=( \$(compgen -W "--ytdlp --self --all" -- "\${cur}") ) ;;
        scan)    COMPREPLY=( \$(compgen -W "--rebuild" -- "\${cur}") ) ;;
    esac
}
complete -F _horizon_completion horizon
`;

export const ZSH = `#compdef horizon
# Horizon CLI — zsh completion
# Instale: horizon completion zsh > ~/.zsh/_horizon
# Adicione ao ~/.zshrc: fpath=(~/.zsh \$fpath); autoload -Uz compinit && compinit

_horizon() {
    local -a cmds
    cmds=(${COMMANDS.map((c) => `'${c}'`).join(' ')})
    _arguments -C \\
        '1: :->cmd' \\
        '*::arg:->args'
    case $state in
        cmd) _describe -t commands 'horizon command' cmds ;;
        args)
            case $words[1] in
                subs)    _values 'subs subcommand' add list remove ;;
                queue)   _values 'queue subcommand' run retry clear list ;;
                antiban) _values 'antiban subcommand' status reset test ;;
                update)  _values 'flags' --ytdlp --self --all ;;
                scan)    _values 'flags' --rebuild ;;
            esac
        ;;
    esac
}
_horizon "$@"
`;

export const FISH = `# Horizon CLI — fish completion
# Instale: horizon completion fish > ~/.config/fish/completions/horizon.fish

complete -c horizon -f
${COMMANDS.map((c) => `complete -c horizon -n '__fish_use_subcommand' -a '${c}'`).join('\n')}
complete -c horizon -n '__fish_seen_subcommand_from subs' -a 'add list remove'
complete -c horizon -n '__fish_seen_subcommand_from queue' -a 'run retry clear list'
complete -c horizon -n '__fish_seen_subcommand_from antiban' -a 'status reset test'
complete -c horizon -n '__fish_seen_subcommand_from update' -a '--ytdlp --self --all'
complete -c horizon -n '__fish_seen_subcommand_from scan' -a '--rebuild'
`;

export function getCompletion(shell) {
    switch ((shell || '').toLowerCase()) {
        case 'bash': return BASH;
        case 'zsh': return ZSH;
        case 'fish': return FISH;
        default: return null;
    }
}
