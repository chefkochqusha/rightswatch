# End-to-end checks

Run against a built and started Bekvor. CI does all of this on every push
(`.github/workflows/ci.yml`).

```bash
python3 e2e/make-audio.py                         # test audio (composed, not real music)
RECOGNIZER_TOKEN=dev PORT=8090 python3 services/recognizer/server.py &
npm run build                                     # needs DATABASE_URL (local Postgres)
JOB_RUNNER=worker RECOGNIZER_URL=http://127.0.0.1:8090 RECOGNIZER_TOKEN=dev \
  UPLOAD_DIR=/tmp/bekvor-uploads npx next start -p 3100 &
E2E_RECOGNITION=1 npm run test:e2e
```

Without the recognition service, leave out `E2E_RECOGNITION`: the
recognition checks are skipped. A Chromium that Playwright didn't install
can be named with `PW_CHROMIUM_PATH`.
