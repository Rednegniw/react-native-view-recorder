package com.reactnativeimagesequenceencoder

import android.graphics.Bitmap
import android.opengl.*
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/** Minimal EGL helper to draw Bitmaps onto an input Surface. */
internal class EglWrapper(
  private val surface: Surface,
  private val width: Int,
  private val height: Int
) {
  private var eglDisplay: EGLDisplay = EGL14.EGL_NO_DISPLAY
  private var eglContext: EGLContext = EGL14.EGL_NO_CONTEXT
  private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE

  private var shaderProgram: Int = 0
  private var positionHandle: Int = 0
  private var texCoordHandle: Int = 0
  private var textureHandle: Int = 0

  private val vertexShaderCode = """
    attribute vec4 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    void main() {
      gl_Position = aPosition;
      vTexCoord = aTexCoord;
    }
  """.trimIndent()

  private val fragmentShaderCode = """
    precision mediump float;
    varying vec2 vTexCoord;
    uniform sampler2D uTexture;
    void main() {
      gl_FragColor = texture2D(uTexture, vTexCoord);
    }
  """.trimIndent()

  // Fullscreen quad vertices: position (x, y) and texture coords (u, v)
  private val quadVertices = floatArrayOf(
    // Position    // TexCoord
    -1f, -1f,      0f, 1f,
     1f, -1f,      1f, 1f,
    -1f,  1f,      0f, 0f,
     1f,  1f,      1f, 0f
  )

  private lateinit var vertexBuffer: FloatBuffer

  init {
    eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    EGL14.eglInitialize(eglDisplay, null, 0, null, 0)
    val attrib = intArrayOf(
      EGL14.EGL_RED_SIZE, 8,
      EGL14.EGL_GREEN_SIZE, 8,
      EGL14.EGL_BLUE_SIZE, 8,
      EGL14.EGL_ALPHA_SIZE, 8,
      EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      EGL14.EGL_NONE
    )
    val configs = arrayOfNulls<EGLConfig>(1)
    val num = IntArray(1)
    EGL14.eglChooseConfig(eglDisplay, attrib, 0, configs, 0, 1, num, 0)
    val ctxAttrib = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
    eglContext = EGL14.eglCreateContext(eglDisplay, configs[0], EGL14.EGL_NO_CONTEXT, ctxAttrib, 0)
    val surfAttrib = intArrayOf(EGL14.EGL_NONE)
    eglSurface = EGL14.eglCreateWindowSurface(eglDisplay, configs[0], surface, surfAttrib, 0)
    EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext)

    // Initialize shader program
    initShaderProgram()

    // Initialize vertex buffer
    vertexBuffer = ByteBuffer.allocateDirect(quadVertices.size * 4)
      .order(ByteOrder.nativeOrder())
      .asFloatBuffer()
      .put(quadVertices)
    vertexBuffer.position(0)
  }

  private fun loadShader(type: Int, shaderCode: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, shaderCode)
    GLES20.glCompileShader(shader)
    return shader
  }

  private fun initShaderProgram() {
    val vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexShaderCode)
    val fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentShaderCode)

    shaderProgram = GLES20.glCreateProgram()
    GLES20.glAttachShader(shaderProgram, vertexShader)
    GLES20.glAttachShader(shaderProgram, fragmentShader)
    GLES20.glLinkProgram(shaderProgram)

    positionHandle = GLES20.glGetAttribLocation(shaderProgram, "aPosition")
    texCoordHandle = GLES20.glGetAttribLocation(shaderProgram, "aTexCoord")
    textureHandle = GLES20.glGetUniformLocation(shaderProgram, "uTexture")

    // Clean up shaders (they're now part of the program)
    GLES20.glDeleteShader(vertexShader)
    GLES20.glDeleteShader(fragmentShader)
  }

  /** Draws the Bitmap into the current GL framebuffer. */
  fun drawBitmap(bmp: Bitmap) {
    val texIds = IntArray(1)
    GLES20.glGenTextures(1, texIds, 0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texIds[0])
    GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bmp, 0)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

    GLES20.glViewport(0, 0, width, height)
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

    // Use our shader program
    GLES20.glUseProgram(shaderProgram)

    // Set up vertex positions (stride = 4 floats * 4 bytes = 16)
    vertexBuffer.position(0)
    GLES20.glEnableVertexAttribArray(positionHandle)
    GLES20.glVertexAttribPointer(positionHandle, 2, GLES20.GL_FLOAT, false, 16, vertexBuffer)

    // Set up texture coordinates
    vertexBuffer.position(2)
    GLES20.glEnableVertexAttribArray(texCoordHandle)
    GLES20.glVertexAttribPointer(texCoordHandle, 2, GLES20.GL_FLOAT, false, 16, vertexBuffer)

    // Bind texture
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texIds[0])
    GLES20.glUniform1i(textureHandle, 0)

    // Draw the quad (triangle strip)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

    // Clean up
    GLES20.glDisableVertexAttribArray(positionHandle)
    GLES20.glDisableVertexAttribArray(texCoordHandle)
    GLES20.glDeleteTextures(1, texIds, 0)
  }

  fun setPresentationTime(nanos: Long) =
    EGLExt.eglPresentationTimeANDROID(eglDisplay, eglSurface, nanos)

  fun swapBuffers() = EGL14.eglSwapBuffers(eglDisplay, eglSurface)

  /** Release EGL resources but keep surface connected for encoder draining */
  fun releaseEgl() {
    if (shaderProgram != 0) {
      GLES20.glDeleteProgram(shaderProgram)
      shaderProgram = 0
    }
    EGL14.eglMakeCurrent(eglDisplay, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
    EGL14.eglDestroySurface(eglDisplay, eglSurface)
    EGL14.eglDestroyContext(eglDisplay, eglContext)
    EGL14.eglTerminate(eglDisplay)
    // Don't release surface - encoder still needs it for EOS signaling
  }

  /** Full release including surface */
  fun release() {
    releaseEgl()
    surface.release()
  }
}
