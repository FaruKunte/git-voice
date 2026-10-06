# git-push-voice

Speaks your `git push` result out loud. Push lands → your computer says
*"Pushed feature-revamp to origin"* — or plays **your own recorded voice**.

Works on macOS (`say` / `afplay`), Linux (`spd-say`, `espeak-ng`, `paplay`,
`ffplay`) and Windows (PowerShell speech / `SoundPlayer`). Zero dependencies;
`ffmpeg` only needed for recording.

## Install

```sh
npm install -g git-push-voice      # or: npm link, from a local checkout
git-push-voice install             # adds a git() wrapper to your shell rc
source ~/.zshrc                    # or open a new terminal
```

Then push like normal:

```
$ git push
Enumerating objects: 5, done.
...
$ Pushed feature-revamp to origin      # ← your computer says this
```

## Uninstall

```sh
git-push-voice uninstall
```

Removes the wrapper block (marked with `# >>> git-push-voice >>>` …
`# <<< git-push-voice <<<`) and leaves the rest of your rc file untouched.

## Commands

| Command | What it does |
| --- | --- |
| `git-push-voice install` | Add the `git()` wrapper to your shell rc file |
| `git-push-voice uninstall` | Remove the wrapper |
| `git-push-voice status` | Show install state, TTS backend and config |
| `git-push-voice preview` | Print the message that would be spoken |
| `git-push-voice say <text>` | Speak arbitrary text now |
| `git-push-voice record` | Record your own voice with the microphone |
| `git-push-voice play <file>` | Play an audio file through the same player |
| `git-push-voice run` | Internal — called by the wrapper after a push |

Flags: `--rc-file <path>` (override the rc file), `--out <path>`,
`--seconds <n>`, `--device <n>`, `--list-devices` (for `record`),
`-h/--help`, `--version`.

## Use your own voice

Instead of the synthetic voice, play a recording of yourself.

### 1. Prerequisites

Recording uses `ffmpeg`. Playback is built in.

```sh
ffmpeg -version || brew install ffmpeg     # macOS
```

On first record, macOS asks for microphone permission — allow it in
**System Settings → Privacy & Security → Microphone** for your terminal.

### 2. Pick a microphone

```sh
$ git-push-voice record --list-devices
[0] MacBook Pro Microphone
[1] Microsoft Teams Audio
```

Skip this step to use the first microphone found.

### 3. Record

```sh
git-push-voice record                      # 5 seconds, default location
git-push-voice record --seconds 3          # shorter clip
git-push-voice record --device 1           # choose a microphone
git-push-voice record --out ~/clips/push.mp3
```

Say something short — *"pushed it!"*, *"another one done"* — and the file is
saved to `~/.config/git-push-voice/clip.wav` by default. Recording starts
immediately, so have your line ready.

### 4. Listen back

```sh
git-push-voice play ~/.config/git-push-voice/clip.wav
```

Not happy? Just record again — it overwrites the same file.

### 5. Point the config at it

```sh
git config --global pushvoice.audio ~/.config/git-push-voice/clip.wav
```

Now every successful `git push` plays your recording instead of the TTS voice.
Confirm with `git-push-voice status`:

```
own voice:    /Users/you/.config/git-push-voice/clip.wav
```

### 6. (Optional) A folder of reactions

`pushvoice.audio` accepts a **folder** too — one of its audio files
(`.wav .mp3 .m4a .aiff .aac .ogg .flac .opus`) is picked at random each push,
so you can collect a pile of reactions:

```sh
git config --global pushvoice.audio ~/clips/push-reactions
```

### Going back to the synthetic voice

```sh
git config --global --unset pushvoice.audio
```

If the configured file goes missing, it logs a warning and falls back to the
spoken message automatically.

## How it works

Git has no post-push hook, and it refuses to alias built-in commands
(`alias.push` is ignored). So `install` appends a small POSIX shell function to
your rc file:

```sh
git() {
	command git "$@"
	local __gpv_status=$?
	if [ $__gpv_status -eq 0 ] && [ "$1" = "push" ] && command -v git-push-voice >/dev/null 2>&1; then
		command git-push-voice run "$@"
	fi
	return $__gpv_status
}
```

Real `git` output and exit codes are untouched. The voice only fires when the
push actually succeeded (`exit 0`) and the subcommand was `push`.

`git-push-voice run` builds the message from your current branch and remote,
then spawns the TTS process **detached**, so your terminal never blocks.

## Configuration

Everything is read from git config:

```sh
# your own recording: a file, or a folder of clips picked at random
git config --global pushvoice.audio ~/.config/git-push-voice/clip.wav

# custom message; {branch} and {remote} are substituted
git config --global pushvoice.text "Shipped {branch} to {remote}"

# macOS voice name (list them with: say -v ?)
git config --global pushvoice.voice "Samantha"

# speed in words per minute
git config --global pushvoice.rate 200

# turn it off without uninstalling
git config --global pushvoice.muted true
```

## Troubleshooting

- **No sound** — run `git-push-voice status` and check `tts backend`. On Linux
  install one of `speech-dispatcher`, `espeak-ng` or `espeak`.
- **Recording fails with "ffmpeg not found"** — `brew install ffmpeg` (macOS) or
  install ffmpeg from your package manager.
- **No microphone listed** — check the terminal has Microphone permission in
  System Settings → Privacy & Security → Microphone, then retry.
- **Own voice not playing** — `git-push-voice status` shows `own voice: …
  (not found)` if the path is wrong; fix it with
  `git config --global pushvoice.audio <path>`.
- **Wrapper not firing** — make sure you sourced your rc file, and that
  `command -v git-push-voice` resolves (it must be on `PATH`).
- **Not supported: fish** — its syntax differs; contributions welcome.

## Development

```sh
npm test        # node --test
```

## License

MIT
