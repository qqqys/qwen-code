# PR4a terminal evidence

These PNGs capture actual tmux terminal output rendered by xterm.js and Playwright with existing Google Chrome. Viewport: 140 columns x 45 rows. Local macOS fixtures, Node 25.9.0 (Ink), Bun 1.3.13 (strict OpenTUI), localhost fake OpenAI provider; no renderer fallback. Each pictured /hello Qwen scenario made zero model requests and exited normally. Images are unedited terminal captures with descriptive window titles.

Before: frozen PR3b bundle from 0e70c2769be66936b785139504f59f4afdadff2b; CLI SHA256 8feae0ca69d6e169544735471adf64fd392400640261b4b1c815f606f8233282. This is not a rebuild of current main.

After: PR4a source 26cc8ec4c2c9ec335879dc4e3a373da7ede96688 on main c1b012539bd860e9e7d679b7c1738bc01fc41b97; CLI SHA256 6454e635cc8e303ff9a2f96e21c757805a00b2f7d53348c43470620a4de0b085; worker SHA256 c19e2699b38a0e028cf13fd77f6087d17ffebe72d28acb57a4964ee97bff7b5f.

The same self-authored frozen Mod registers hello on session.start and returns PR4A_HELLO:<argument>:<call count>. Before reports an unknown command; after returns PR4A_HELLO:Qwen:1. This demonstrates the documented terminal command subset, not live-provider or arbitrary Claude Mod compatibility.

## Image SHA256

- ink-before.png: f7344cf8b323da7c09f9e657a636d6cfa59618b7507f13cd3aabd4c33639eba0
- opentui-before.png: 60bfe4fdbd120774022ec670eca12ab19a98b3c4f7c67504938b33ead66dee9c
- ink-after.png: bb933174419a45b5a402f1fab10020145df7676af7cb9ffa28efe7425524122b
- opentui-after.png: a0fba54b190670f64bb332531935a12bc060bdf9617282e2b449560b9149eee2
