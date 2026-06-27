```markdown
GaborNeuroFit/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions CI/CD deployment pipeline
├── public/                     # Static assets that Vite serves untouched
│   └── i18n/                   # Externalized translation JSON files
│       ├── en.json             # English dictionary
│       └── ru.json             # Russian dictionary (with Sentence case labels)
├── src/                        # Modular JavaScript source code
│   ├── app.js                  # Core bootstrap and event routing (Entry Point)
│   ├── store.js                # State machine \& localStorage management
│   ├── engine/                 # Low-level mathematical generators
│   │   ├── gabor.js            # Gabor pixels mathematical synthesis \& fusion frames
│   │   └── audio.js            # Web Audio API procedural synthesis (sounds)
│   └── ui/                     # UI reactive rendering \& DOM event bindings
│       ├── modal.js            # Handlers for Settings \& Info modals
│       ├── controls.js         # Answer buttons, key bindings, and click listeners
│       └── screen.js           # Display panels, scoreboard, and canvas clearing
├── index.html                  # HTML entry point (now imports src/app.js)
├── styles.css                  # Hardware-accelerated CSS rules \& keyframes
├── package.json                # Project dependencies \& npm scripts
└── vite.config.js              # Vite compiler configuration
```

