import { sendMessageAsUser } from '../../../../script.js';
import { power_user } from '../../../../scripts/power-user.js';
import { SlashCommand } from '../../../../scripts/slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../../scripts/slash-commands/SlashCommandParser.js';
import { macros, MacroCategory } from '../../../../scripts/macros/macro-system.js';
import { MacrosParser } from '/scripts/macros.js';

const OSU_SONG_IDS_MACRO = 'osu_song_ids';
const OSU_SONG_IDS_COMMAND = 'osu-song-ids';
const OSU_SONG_IDS_EMPTY_MESSAGE = 'No osu! song IDs are currently registered.';

let songIdsCache = [];
let songIdsLoadPromise = null;

function formatSongIds(songIds) {
    return songIds.join(', ');
}

async function loadSongIds({ forceRefresh = false } = {}) {
    if (songIdsCache.length > 0 && !forceRefresh) {
        return songIdsCache;
    }

    if (songIdsLoadPromise && !forceRefresh) {
        return songIdsLoadPromise;
    }

    const beatmapsUrl = new URL('./beatmaps.json', import.meta.url);
    songIdsLoadPromise = (async () => {
        try {
            const response = await fetch(beatmapsUrl.toString());
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} while loading beatmaps`);
            }

            const data = await response.json();
            const beatmaps = Array.isArray(data?.beatmaps) ? data.beatmaps : [];
            const nextSongIds = beatmaps
                .map(beatmap => (typeof beatmap?.id === 'string' ? beatmap.id.trim() : ''))
                .filter(Boolean);

            songIdsCache = [...new Set(nextSongIds)];
        } catch (error) {
            console.error('Failed to load osu! song IDs for macro/command:', error);
        } finally {
            songIdsLoadPromise = null;
        }

        return songIdsCache;
    })();

    return songIdsLoadPromise;
}

function getSongIdsMacroValue() {
    if (!songIdsCache.length && !songIdsLoadPromise) {
        void loadSongIds();
    }

    return formatSongIds(songIdsCache);
}

async function getSongIdsCommandValue() {
    const songIds = await loadSongIds({ forceRefresh: true });
    if (!songIds.length) {
        return OSU_SONG_IDS_EMPTY_MESSAGE;
    }

    return formatSongIds(songIds);
}

function registerSongIdsSlashCommand() {
    if (Object.hasOwn(SlashCommandParser.commands, OSU_SONG_IDS_COMMAND)) {
        return;
    }

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: OSU_SONG_IDS_COMMAND,
        callback: async () => getSongIdsCommandValue(),
        helpString: `Returns all osu! song IDs as a comma-separated list. Macro equivalent: {{${OSU_SONG_IDS_MACRO}}}.`,
        returns: 'string',
    }));
}

function registerSongIdsMacro() {
    const description = 'Returns all osu! song IDs as a comma-separated list.';

    if (power_user.experimental_macro_engine) {
        if (!macros.registry.hasMacro(OSU_SONG_IDS_MACRO)) {
            macros.register(OSU_SONG_IDS_MACRO, {
                category: MacroCategory.MISC,
                description,
                handler: () => getSongIdsMacroValue(),
            });
        }
    } else {
        // TODO: Remove this fallback when the old macro engine is fully deprecated.
        MacrosParser.registerMacro(
            OSU_SONG_IDS_MACRO,
            () => getSongIdsMacroValue(),
            description,
        );
    }
}

(function(){
    function addOsuButton(){
        const osuButton = document.createElement('div');
        osuButton.id = 'osu-launch';
        osuButton.classList.add('list-group-item','flex-container','flexGap5','interactable');
        osuButton.tabIndex = 0;
        osuButton.title = 'Launch osu! Rhythm Game';
        const icon = document.createElement('i');
        icon.classList.add('fa-solid','fa-music');
        osuButton.appendChild(icon);
        const text = document.createElement('span');
        text.textContent = 'Play osu!';
        osuButton.appendChild(text);
        const extensionsMenu = document.getElementById('chess_wand_container') ?? document.getElementById('extensionsMenu');
        if (!extensionsMenu) {
            console.error('osu! extension menu container not found.');
            return;
        }
        extensionsMenu.appendChild(osuButton);
        osuButton.addEventListener('click', launchOsuGame);
    }

    async function launchOsuGame(){
        const context = SillyTavern.getContext();
        if (!context) {
            console.error('SillyTavern context unavailable.');
            return;
        }

        // Check if a specific song is requested via SillyTavern variable
        let songId = '';
        try {
            // Try to get the Song variable from SillyTavern
            const songVar = context.extensionSettings?.variables?.global?.Song ||
                           context.chatMetadata?.variables?.Song || '';
            if (songVar) {
                songId = songVar;
            }
        } catch (e) {
            console.log('Could not read Song variable:', e);
        }

        // Create a message for proper display
        const gameId = `sillytavern-osu-${Math.random().toString(36).substring(2)}`;
        await sendMessageAsUser(gameId);

        // Find the message we just created
        const chat = document.getElementById('chat');
        if (!chat) {
            console.error('Chat container not found.');
            return;
        }
        const chatMessage = chat.querySelector('.last_mes');
        if (!chatMessage) {
            console.error('Could not find created game message.');
            return;
        }
        const messageText = chatMessage.querySelector('.mes_text');
        if (!messageText) {
            console.error('Game message text container not found.');
            return;
        }

        // Clear the message ID and add the game
        chatMessage.classList.remove('last_mes');
        messageText.textContent = '';
        const container = document.createElement('div');
        container.classList.add('flex-container','flexFlowColumn','flexGap10');
        messageText.appendChild(container);
        const iframe = document.createElement('iframe');

        // Build URL with optional song parameter
        const gameUrl = new URL('./osu.html', import.meta.url);
        if (songId) {
            gameUrl.searchParams.set('song', songId);
        }
        gameUrl.searchParams.set('gameId', gameId);
        gameUrl.searchParams.set('parentOrigin', window.location.origin);
        iframe.src = gameUrl.toString();

        iframe.style.border='0';
        iframe.classList.add('wide100p');
        iframe.style.height='600px';
        container.appendChild(iframe);
        chat.scrollTop = chat.scrollHeight;

        const expectedOrigin = gameUrl.origin;

        // Store reference to the message element for removal later
        const gameMessage = chatMessage;

        function handleOsuMessage(ev){
            if (ev.source !== iframe.contentWindow) return;
            if (ev.origin !== expectedOrigin) return;
            if (!ev.data || ev.data.type !== 'osuComplete') return;
            if (ev.data.gameId !== gameId) return;

                window.removeEventListener('message', handleOsuMessage);

                // Remove the game message from DOM
                gameMessage.remove();

                // Also remove it from the chat array
                const messageIndex = Array.isArray(context.chat)
                    ? context.chat.findIndex(msg => msg.mes === gameId)
                    : -1;
                if(messageIndex !== -1){
                    context.chat.splice(messageIndex, 1);
                }

                const data = ev.data.data || {};
                const songInfo = `${data.songTitle} by ${data.songArtist}`;
                let resultText;

                if (data.failed) {
                    resultText = `[{{user}} played osu! "${songInfo}" (${data.difficulty}) and FAILED!\n` +
                        `Grade: F | Score: ${data.score.toLocaleString()} | Accuracy: ${data.accuracy}% | Max Combo: ${data.maxCombo}x\n` +
                        `300s: ${data.hit300} | 100s: ${data.hit100} | 50s: ${data.hit50} | Misses: ${data.misses}]`;
                } else if (data.fullCombo) {
                    resultText = `[{{user}} played osu! "${songInfo}" (${data.difficulty}) and achieved a FULL COMBO!\n` +
                        `Grade: ${data.grade} | Score: ${data.score.toLocaleString()} | Accuracy: ${data.accuracy}% | Max Combo: ${data.maxCombo}x\n` +
                        `300s: ${data.hit300} | 100s: ${data.hit100} | 50s: ${data.hit50}]`;
                } else {
                    resultText = `[{{user}} played osu! "${songInfo}" (${data.difficulty})\n` +
                        `Grade: ${data.grade} | Score: ${data.score.toLocaleString()} | Accuracy: ${data.accuracy}% | Max Combo: ${data.maxCombo}x\n` +
                        `300s: ${data.hit300} | 100s: ${data.hit100} | 50s: ${data.hit50} | Misses: ${data.misses}]`;
                }

                // Put the result in the input field for the user to send
                const inputField = $('#send_textarea');
                if (inputField.length > 0) {
                    inputField.val(resultText)[0].dispatchEvent(new Event('input', { bubbles: true }));
                }
        }
        window.addEventListener('message', handleOsuMessage);
    }

    registerSongIdsSlashCommand();
    registerSongIdsMacro();
    void loadSongIds();
    addOsuButton();
})();
