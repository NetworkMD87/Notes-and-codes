`electron-get-proxy-test-cert.pem` and `electron-get-proxy-test-key.pem` are a self-signed, test-only localhost certificate pair for `electronGetProxy.test.ts`. The test trusts this certificate only through Got's per-request CA option; it does not modify the OS or Node certificate stores, and it also checks that the same certificate is rejected when it is not supplied as a CA.

All proxy and target servers bind to `127.0.0.1`. The remote-looking artifact URLs are sent only to the local test proxy; direct-path cases use loopback addresses. No external service is contacted.
