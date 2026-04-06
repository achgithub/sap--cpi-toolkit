package com.sap.gateway.ip.core.customdev.util

/**
 * Mock of the SAP CPI Message interface.
 * Scripts that import this package will compile against this definition,
 * which is structurally identical to the real SAP CPI SDK interface.
 * Only the methods most commonly used in CPI Groovy scripts are included.
 */
interface Message {

    /** Returns the message body coerced to the given type (String, InputStream, byte[]). */
    def <T> T getBody(Class<T> type)

    /** Replaces the message body. */
    void setBody(Object body)

    /** Returns all message headers as a mutable map. */
    Map<String, Object> getHeaders()

    /** Sets (or replaces) a single header. */
    void setHeader(String name, Object value)

    /** Returns the value of a header, or the supplied default if absent. */
    String getHeader(String name, String defaultValue)

    /** Returns all exchange properties as a mutable map. */
    Map<String, Object> getProperties()

    /** Sets (or replaces) a single exchange property. */
    void setProperty(String name, Object value)

    /** Returns the value of an exchange property, or null if absent. */
    Object getProperty(String name)
}
