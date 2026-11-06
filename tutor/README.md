# Tutor Offline

Un tutor de IA para chicos de 8 a 14 años que corre en una laptop, sin internet. Explica matemática y ciencias paso a paso, hace una pregunta de vuelta y muestra de dónde sale cada respuesta. Es un prototipo para un video demo.

## Cómo correrlo

Necesita macOS 14 o superior con Apple Silicon, Node `^22.21` o `>=24.9`, y unos 3 GB de disco para los modelos.

Hay que preparar una sola vez, con internet, desde la raíz del repo:

```bash
npm ci
```

Los modelos se buscan en `~/.qvac/models`. Si no están, basta con correr una vez el inbox del repo (`node server.js`) con internet: los descarga ahí.

Después, sin internet:

```bash
./tutor/run.sh               # abre el tutor en pantalla completa
./tutor/run.sh --no-browser  # solo el servidor, en http://127.0.0.1:8788
./tutor/run.sh --test        # tests rápidos, unos segundos
./tutor/run.sh --test-all    # además, los modelos reales dentro del sandbox
```

**Usa una carpeta local, no Dropbox ni iCloud.** Esos servicios pueden dejar archivos solo en la nube, y sin internet el tutor no arrancaría. `run.sh` avisa si detecta una de esas carpetas.

## Modelos y motor

Todo corre con `@qvac/sdk` 0.21.0 (Apache-2.0).

| Uso | Modelo | Licencia |
|---|---|---|
| Respuestas | Qwen3 4B Q4_K_M | Apache-2.0 |
| Búsqueda (RAG) | EmbeddingGemma 300M Q8_0 | [Gemma Terms of Use](https://ai.google.dev/gemma/terms) |

Los modelos se cargan por ruta local, así el SDK no usa su registro P2P.

## Cómo garantiza que no usa la red

1. **Bloqueo del sistema.** `tools/sandbox.sb` usa `sandbox-exec` para bloquear IPv4, IPv6, UDP y DNS en el tutor y sus procesos hijos. Solo permite localhost y el socket interno del SDK. Si el bloqueo no funciona al arrancar, el tutor se detiene.
2. **Monitor externo.** `supervisor.mjs` revisa los sockets del tutor cada 0,5 s desde afuera del bloqueo. Si encuentra una conexión externa, el tutor deja de responder.
3. **Navegador.** El servidor solo escucha en `127.0.0.1`, rechaza pedidos de otros sitios y usa una política CSP que impide cargar recursos externos.

El indicador muestra lo que está comprobado en ese momento:

| Indicador | Significado |
|---|---|
| Sin conexión ✓ | La Mac no tiene conexión y el tutor no tiene sockets externos |
| Sin llamadas de red ✓ | La Mac tiene conexión, pero el tutor no tiene sockets externos |
| Verificando red… | El monitor no está midiendo, así que no se afirma nada |
| Conexión detectada | Se encontró un socket externo y el tutor deja de responder |

Límites: `sandbox-exec` figura como obsoleto en macOS, aunque funcionó en 26.4. El bloqueo cubre al tutor, no al navegador: `run.sh` abre Chrome con un perfil aparte y sus servicios en segundo plano apagados, pero para el video hay que apagar el Wi-Fi igual.

## Cómo responde

1. **Seguridad:** las preguntas sobre temas inapropiados se redirigen, y las de autolesiones o maltrato derivan a un adulto de confianza. El modelo no las recibe.
2. **Búsqueda:** el RAG compara la pregunta con todos los párrafos del pack, usando los embeddings de QVAC, y la rechaza si la coincidencia es baja. La búsqueda es exacta porque el índice aproximado del SDK perdía párrafos según cómo se armara en cada arranque.
3. **Comprobación:** las palabras clave de la pregunta tienen que estar en un mismo artículo. Si no, dice "No lo sé" sin llamar al modelo. Solo se usa y se cita el artículo que mejor cubre la pregunta.
4. **Respuesta:** de 2 a 3 pasos y una pregunta de vuelta, en tiempo real. Lo que el modelo escribe se revisa antes de llegar a la pantalla.
5. **Fuentes:** las agrega el servidor según el material usado, no el modelo.

Cuando el alumno responde la pregunta de vuelta, el tutor no le dice si está bien o mal: en las pruebas, el modelo marcó como incorrecta una respuesta correcta. En su lugar, le muestra cómo comprobarlo.

## Rendimiento

Medido el 2026-11-05 en una MacBook con **Apple M1 Pro y 16 GB**, macOS 26.4, con la red bloqueada y el swap casi lleno (22 de 23,5 GB) por otras apps abiertas.

| Medida | Resultado |
|---|---|
| Primera palabra, 5 preguntas de la demo | **1,5 a 1,8 s** (objetivo: menos de 3 s) |
| Primera palabra, 60 temas del pack | mediana 1,7 s, máximo 2,0 s en la última corrida |
| Respuesta completa, demo | 4,7 a 7,1 s |
| Largo de la respuesta, demo | 82 a 96 palabras (objetivo: 80 a 120) |
| "No lo sé" y redirecciones | menos de 0,1 s |
| Carga de los modelos y del pack | 6 a 8 s (la primera vez tras reiniciar puede tardar más) |

**Con la memoria llena puede trabarse.** En dos corridas anteriores, con el swap casi agotado, unas pocas preguntas tardaron entre 1 y 5,6 minutos en dar la primera palabra. Fueron preguntas distintas en cada corrida, y la última no tuvo ninguna, así que la causa más probable es la memoria, aunque no está comprobada. Hay que cerrar las demás apps antes de grabar.

Mientras espera, el tutor hace cada 15 s una inferencia mínima para que macOS no saque el modelo de la memoria. Se puede desactivar con `TUTOR_KEEP_WARM_MS=0`.

Con la misma pregunta y el mismo pack, dos corridas dieron el mismo texto: lo que está en `demo_script.md` es lo que se debería ver. Si cambian el prompt o el material, hay que regenerarlo con `node tutor/tools/make_demo_script.mjs`.

## Calidad por idioma

- **Español e inglés:** buena para las 5 preguntas de `demo_script.md`, elegidas tras revisar 20 respuestas contra el pack. Fuera de esas 5 la calidad es desigual; ver Limitaciones.
- **Suajili: no utilizable.** Con Qwen3 4B salieron frases sin sentido, y con Qwen3 8B, bucles de repetición, ambos con el material a la vista. Por eso el tutor muestra un aviso y no genera texto. Las respuestas se pueden reproducir con `tools/eval_swahili.mjs`.

## Pack de contenidos

60 archivos en `content/`: 30 temas de primaria, cada uno en español y en inglés (11 de matemática y 19 de ciencias). Son adaptaciones de Wikipedia bajo **CC BY-SA 4.0**. El detalle por archivo está en [`content/LICENSES.md`](content/LICENSES.md).

- **Matemática:** suma, resta, multiplicación, división, fracciones, decimales, porcentaje, perímetro, área, ángulos y triángulos.
- **Ciencias:** lluvia, ciclo del agua, estados de la materia, sistema solar, Luna, gravedad, volcanes, terremotos, electricidad, imanes, sonido, fotosíntesis, cadena alimentaria, célula, mamíferos, corazón, esqueleto, digestión y respiración.

`node tutor/tools/eval_pack.mjs`, con el tutor corriendo, hace una pregunta por cada tema y otras fuera del pack. Última corrida: **60 de 60** respondidas con la fuente correcta y **18 de 18** rechazadas. Esas preguntas sirvieron para ajustar el sistema, así que el resultado no predice cómo le irá con preguntas nuevas.

Para agregar un tema, crea un archivo con los mismos metadatos y corre `node tutor/tools/make_licenses.mjs`.

## Limitaciones

- **No está listo para que lo usen chicos sin supervisión.** Los filtros buscan palabras en español e inglés: alguien puede esquivarlos con otras palabras, y no reemplazan a un sistema de seguridad evaluado.
- **Puede equivocarse o agregar detalles.** Citar la fuente no garantiza que cada frase salga de ella. En las pruebas, un modelo tan chico dijo que un volcán crece antes de la erupción, mezcló los polos de un imán con un clavo, escribió "un peso toooooodo" y escribió "ventrículas". En las 5 respuestas de la demo quedan detalles menores que no están en la fuente, anotados en `demo_script.md`.
- **El formato no siempre se cumple.** En la última evaluación, 17 de las 60 respuestas quedaron fuera de las 80 a 120 palabras, y algunas repiten la pregunta final o agregan un paso.
- **El filtro de palabras es estricto.** Preguntas válidas con otras palabras pueden recibir "No lo sé".
- **El pack sigue siendo chico.** Fuera de esos 30 temas, responde "No lo sé".
- **Solo macOS,** por `sandbox-exec`.

## Tests

`--test` cubre guardrails, citas, licencias, sandbox y monitor de red con sockets reales. `--test-all` suma el modelo real dentro del sandbox: 52 tests, todos pasan. El modo sin Wi-Fi se comprueba a mano con el paso 2 de `demo_script.md`.
