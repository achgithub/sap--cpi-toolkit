package com.achgithub.groovyrunner

import com.sap.gateway.ip.core.customdev.util.Message
import groovy.lang.Binding
import groovy.lang.GroovyShell
import groovy.lang.MissingMethodException
import org.codehaus.groovy.control.CompilationFailedException
import org.codehaus.groovy.control.CompilerConfiguration

import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Executes a CPI-style Groovy script inside a sandboxed GroovyShell.
 *
 * Script contract:
 *   import com.sap.gateway.ip.core.customdev.util.Message
 *   def Message processData(Message message) { ... }
 *
 * stdout capture: Groovy's println() in both script body and script methods
 * resolves to binding.out, which is set to a per-execution StringWriter.
 * Scripts do not need to change — println works as expected.
 *
 * Timeout: executions that exceed timeoutMs are cancelled and return an error.
 */
class ScriptExecutor {

    private static final pool = Executors.newCachedThreadPool()

    static Map<String, Object> execute(
            String script,
            String body,
            Map<String, Object> headers,
            Map<String, Object> properties,
            int timeoutMs) {

        long start = System.currentTimeMillis()

        Future<Map<String, Object>> future = pool.submit({
            def output     = new StringWriter()
            def printWriter = new PrintWriter(output, true)

            def binding = new Binding()
            binding.setVariable('out', printWriter)

            // Mock MPL — writes log calls to the IDE console so you can see what
            // would be recorded in the Message Processing Log on a real tenant.
            def mockMPL = [
                setStringProperty:     { String k, String v ->
                    printWriter.println("[MPL] Property  ${k} = ${v}")
                },
                addAttachmentAsString: { String name, String content, String ct ->
                    printWriter.println("[MPL] Attachment '${name}' (${ct}, ${content?.length() ?: 0} chars)")
                },
            ]
            binding.setVariable('messageLogFactory', [
                getMessageLog: { msg -> mockMPL }
            ])

            def config = new CompilerConfiguration()
            // Keep the standard Script base class so println → binding.out works
            config.scriptBaseClass = 'groovy.lang.Script'

            // Use a child classloader so user scripts can import our mock classes
            def classLoader = new GroovyClassLoader(ScriptExecutor.classLoader)
            def shell       = new GroovyShell(classLoader, binding, config)

            def message   = new MockMessage(body, headers, properties)
            def scriptObj = shell.parse(script)

            def result = scriptObj.invokeMethod('processData', [message] as Object[])

            // If the script returned a Message, use it; otherwise fall back to
            // the original message (which may have been mutated in-place)
            def out = (result instanceof Message) ? result : message

            [
                body:       out.getBody(String) ?: '',
                headers:    new LinkedHashMap<>(out.getHeaders()),
                properties: new LinkedHashMap<>(out.getProperties()),
                stdout:     output.toString(),
            ]
        } as Callable<Map<String, Object>>)

        try {
            def result = future.get(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
            result.execution_ms = System.currentTimeMillis() - start
            return result

        } catch (TimeoutException ignored) {
            future.cancel(true)
            return [
                error:        "Script timed out after ${timeoutMs} ms",
                stdout:       '',
                execution_ms: (long) timeoutMs,
            ]

        } catch (ExecutionException e) {
            def cause = e.cause ?: e
            def msg = formatError(cause)
            return [
                error:        msg,
                stdout:       '',
                execution_ms: System.currentTimeMillis() - start,
            ]
        }
    }

    private static String formatError(Throwable t) {
        if (t instanceof CompilationFailedException) {
            // Strip the noisy preamble Groovy adds
            def lines = t.message.split('\n').findAll { it.trim() }
            return lines.join('\n')
        }
        if (t instanceof MissingMethodException && t.method == 'processData') {
            return 'Script must define: def Message processData(Message message) { ... }'
        }
        // Unwrap InvocationTargetException chains
        if (t.cause && t.cause != t) {
            return formatError(t.cause)
        }
        return t.message ?: t.class.simpleName
    }
}
