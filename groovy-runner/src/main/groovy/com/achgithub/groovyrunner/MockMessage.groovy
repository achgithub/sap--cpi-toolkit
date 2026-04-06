package com.achgithub.groovyrunner

import com.sap.gateway.ip.core.customdev.util.Message

/**
 * In-process mock of the SAP CPI Message object.
 * Passed to user scripts as the message argument to processData().
 */
class MockMessage implements Message {

    private Object body
    private final Map<String, Object> headers
    private final Map<String, Object> properties

    MockMessage(Object body, Map<String, Object> headers, Map<String, Object> properties) {
        this.body       = body
        this.headers    = new LinkedHashMap<>(headers    ?: [:])
        this.properties = new LinkedHashMap<>(properties ?: [:])
    }

    @Override
    def <T> T getBody(Class<T> type) {
        if (type == String || type == null) {
            if (body instanceof InputStream) {
                return (T) ((InputStream) body).getText('UTF-8')
            }
            if (body instanceof byte[]) {
                return (T) new String((byte[]) body, 'UTF-8')
            }
            return (T) body?.toString()
        }
        if (type == InputStream) {
            if (body instanceof InputStream) return (T) body
            def bytes = body instanceof byte[] ? (byte[]) body : body?.toString()?.bytes ?: new byte[0]
            return (T) new ByteArrayInputStream(bytes)
        }
        if (type == byte[]) {
            if (body instanceof byte[])      return (T) body
            if (body instanceof InputStream) return (T) ((InputStream) body).bytes
            return (T) (body?.toString()?.bytes ?: new byte[0])
        }
        // Fallback: return as-is and let Groovy coerce
        return (T) body
    }

    @Override
    void setBody(Object body) {
        this.body = body
    }

    @Override
    Map<String, Object> getHeaders() { return headers }

    @Override
    void setHeader(String name, Object value) { headers[name] = value }

    @Override
    String getHeader(String name, String defaultValue) {
        def v = headers[name]
        return v != null ? v.toString() : defaultValue
    }

    @Override
    Map<String, Object> getProperties() { return properties }

    @Override
    void setProperty(String name, Object value) { properties[name] = value }

    @Override
    Object getProperty(String name) { return properties[name] }
}
