# Global LLM Radar Intelligence

Source-bound v1 dashboard for tracking major US/China LLM vendors across:

- API/model price records from public aggregators/channel metadata.
- Model/context metadata from OpenRouter/LiteLLM.
- Demand/adoption proxies from Hugging Face, GitHub and npm.
- Official pricing URL registry for analyst verification.

## Boundary

This product does **not** claim to know global token market share. OpenRouter/HF/GitHub/npm signals are channel/developer/open-source proxies. Official vendor pricing pages remain the IC-grade verification layer.

## Commands

```bash
npm run collect
npm test
npm run check
npm start
```

Endpoints:

- `/`
- `/api/health`
- `/api/state`
- `/api/state?refresh=1`
- `/api/export/markdown`
