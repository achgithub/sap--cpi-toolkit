package com.achgithub.groovyrunner

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

import java.util.concurrent.Executors

/**
 * Minimal HTTP server for the Groovy runner service.
 *
 * Routes:
 *   GET  /health   → 200 "ok"
 *   POST /execute  → execute a CPI Groovy script, return JSON result
 *                    (portal strips /api/groovy prefix before forwarding)
 *
 * Request body for /groovy/execute:
 *   {
 *     "script":      "def Message processData(Message message) { ... }",
 *     "body":        "<xml>...</xml>",
 *     "headers":     { "key": "value" },
 *     "properties":  { "key": "value" },
 *     "timeout_ms":  10000
 *   }
 *
 * Success response:
 *   { "body": "...", "headers": {...}, "properties": {...},
 *     "stdout": "...", "execution_ms": 45 }
 *
 * Error response (HTTP 422):
 *   { "error": "...", "stdout": "...", "execution_ms": 45 }
 */
class Main {

    static void main(String[] args) {
        int port = (System.getenv('PORT') ?: '8082').toInteger()

        def server   = HttpServer.create(new InetSocketAddress(port), 0)
        def executor = Executors.newFixedThreadPool(8)

        server.createContext('/health') { HttpExchange ex ->
            respond(ex, 200, 'ok', 'text/plain')
        }

        server.createContext('/execute') { HttpExchange ex ->
            if (ex.requestMethod != 'POST') {
                jsonError(ex, 405, 'method not allowed')
                return
            }
            try {
                def raw = ex.requestBody.text
                def req = new JsonSlurper().parseText(raw) as Map

                String script     = req.script ?: ''
                String body       = req.body   ?: ''
                Map headers       = (req.headers     as Map<String, Object>) ?: [:]
                Map properties    = (req.properties  as Map<String, Object>) ?: [:]
                int timeoutMs     = (req.timeout_ms  as Integer)             ?: 10_000

                if (!script.trim()) {
                    jsonError(ex, 400, 'script is required')
                    return
                }

                def result = ScriptExecutor.execute(script, body, headers, properties, timeoutMs)
                int status = result.containsKey('error') ? 422 : 200
                jsonRespond(ex, status, result)

            } catch (Exception e) {
                jsonError(ex, 500, e.message ?: 'internal error')
            }
        }

        server.executor = executor
        server.start()
        println "[groovy-runner] listening on :${port}"
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static void respond(HttpExchange ex, int status, String body, String contentType) {
        def bytes = body.getBytes('UTF-8')
        ex.responseHeaders.set('Content-Type', contentType)
        ex.sendResponseHeaders(status, bytes.length)
        ex.responseBody.write(bytes)
        ex.responseBody.close()
    }

    private static void jsonRespond(HttpExchange ex, int status, Object payload) {
        respond(ex, status, JsonOutput.toJson(payload), 'application/json')
    }

    private static void jsonError(HttpExchange ex, int status, String message) {
        jsonRespond(ex, status, [error: message])
    }
}
