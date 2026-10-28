# Sync-Gram: sincroniza tus aparatos de Kino a través de tu propio bot de Telegram

[Read in English](README.md)

> **No oficial: sin relación con Telegram.** Sync-Gram es un plugin de Kino que usa la Bot API pública
> de Telegram; Telegram no lo hace, no lo respalda ni le da soporte.

Este repositorio es **Sync-Gram**, un **proveedor de sincronización de Kino** completo, que mantiene al día tu celular y
tu TV (historial, biblioteca, progreso y ajustes) a través de un **bot de Telegram que creas tú
mismo**. Kino cifra una copia de tus datos; el plugin envía esa copia como archivo a tu chat privado
con el bot y la fija. Tus otros aparatos leen de vuelta el archivo fijado.

No hay servidor de Kino ni servidor tuyo: solo la Bot API pública de Telegram (`api.telegram.org`),
que es la única dirección a la que este plugin puede conectarse.

```
tu celular ─┐                                                    ┌─ tu chat privado con el bot
            ├─ https ─▶ api.telegram.org (el token de tu bot) ───┤    📌 kino-sync.bin  (la copia cifrada)
tu TV  ─────┘                                                    └─ (solo se guarda la copia más nueva)
```

Es un ejemplo para aprender y copiar, publicado como código por los autores de Kino. Nadie corre un
bot por ti: el bot es tuyo.

## Qué necesitas

- Una cuenta de Telegram, en cualquier aparato (celular, computador o <https://web.telegram.org>).
- Kino 0.9.74 o más nuevo en tus aparatos.

**¿Por qué no hace falta un túnel?** Algunos proveedores de sincronización necesitan un túnel porque un
plugin de Kino solo puede conectarse a direcciones https públicas, nunca a tu red local. La Bot API de
Telegram ya es una dirección https pública, así que aquí no necesitas un computador encendido, ni
túnel, ni servidor.

## 1. Crea tu bot con @BotFather

1. En Telegram, busca **@BotFather** (el oficial tiene una marca azul) y ábrelo.
2. Envía `/newbot`.
3. BotFather te pide un **nombre**: el que quieras, por ejemplo `Mi sincronización de Kino`.
4. Te pide un **usuario**: tiene que terminar en `bot`, por ejemplo `ana_kino_sync_bot`. Si ya está
   ocupado, prueba otro.
5. BotFather responde con el **token** de tu bot, una línea como `7712345678:AAH…` (números, dos
   puntos y unas 35 letras, números, `-` o `_`). **Cópialo.**
   - El token es como una contraseña de tus datos sincronizados: quien lo tenga puede leerlos (mira
     [Qué pueden leer Telegram y el plugin](#qué-pueden-leer-telegram-y-el-plugin)). No lo pegues en
     chats ni en capturas de pantalla.
   - Usa este bot **solo para Kino**. No lo agregues a grupos ni lo conectes a otros programas o
     servicios de bots.
6. Toca el enlace del bot en la respuesta de BotFather (`t.me/<usuario>`) y toca **Iniciar**.

## 2. Instala el plugin en Kino

1. En el celular, abre **Menú ▸ Plugins** y toca **+** (Agregar plugin). En la TV, abre **Plugins** y
   elige **Agregar plugin**.
2. Deja el tipo en **Kino**. En **Dirección del plugin**, escribe `kinotvapp/kino-plugin-sync-gram` y toca
   **Agregar**. (También está en los plugins recomendados de Kino, desde Kino 0.9.74: las versiones
   anteriores no pueden usar un proveedor de sincronización y no lo muestran.)
3. Kino muestra **Instalar Sync-Gram**. Toca **Ver detalles** y lee la línea en rojo:
   - *Sincronizará tus datos a través de su servicio: el plugin y su servicio podrán leerlos.* Es
     cierto; mira [Qué pueden leer Telegram y el plugin](#qué-pueden-leer-telegram-y-el-plugin).
4. También dice *Este plugin usa tu usuario y contraseña*: aquí es el token del bot. Su único servidor
   es `api.telegram.org`. Toca **Instalar**.

Kino copia el plugin a tus otros aparatos emparejados por esa dirección, y cada uno lo descarga por su
cuenta.

## 3. Enciende el proveedor

1. Abre **Ajustes ▸ Ajustes de todos los perfiles ▸ Sincronización ▸ Proveedor**. *Sync-Gram* aparece
   debajo de **Red local**.
2. Enciende su interruptor. Kino pregunta **"¿Sincronizar con Sync-Gram?"**:
   - la sincronización por red local se apaga mientras uses este proveedor;
   - si el bot ya guarda datos de otro aparato, se combinan con los de este; no se pierde lo que solo
     tiene uno de los dos;
   - en rojo: el plugin y su servicio podrán leer los datos.

   Toca **Combinar con este aparato**.
3. La fila ahora dice *Falta el token: configúralo en Conectar*, con un botón **Conectar**.

## 4. Conectar: pega el token, escríbele a tu bot, confirma que eres tú

1. Toca **Conectar** y luego **Configurar** en la página del plugin. Se abre su pantalla propia, un paso a la vez
   (Kino 0.9.74 o posterior):
   - **Paso 1, crea tu bot:** **Abrir @BotFather** abre BotFather en la app de Telegram (en una TV, Kino muestra la
     dirección y un QR para abrirla en tu celular). Kino no hace ninguna petición a esa dirección.
2. **Paso 2, pega el token:** pégalo en **Token del bot** y toca **Guardar**. El campo es oculto. Un token con forma
   equivocada se marca antes de enviar nada, y uno que Telegram no acepta nunca se guarda: la pantalla le pregunta a
   Telegram en el momento. Pasa sola al paso 3.
3. **Paso 3, escríbele a tu bot:** en Telegram, abre **tu bot** (la pantalla tiene un botón **Abrir @tu_bot**) y
   escríbele cualquier cosa (`hola` sirve). No hay nada que tocar en Kino: la pantalla escucha sola mientras está
   abierta y toma el mensaje más reciente que **una persona** le escribió **en privado**. Los mensajes de grupos, de
   canales o de otros bots se ignoran.
4. La pantalla pregunta **"@ana le escribió a tu bot. ¿Eres tú?"** (tu usuario de Telegram, o tu nombre si no tienes
   usuario), con **Sí, soy yo** y **No soy yo**.
   - **Compara ese nombre con tu propia cuenta de Telegram** (en Telegram: Ajustes, tu usuario debajo
     de tu nombre). Cualquiera que encuentre tu bot puede escribirle; si el nombre no es el tuyo, toca
     **No soy yo** y vuelve a escribirle a tu bot.
   - **No soy yo** no vincula nada.
   - **Sí, soy yo** vincula ese chat, y solo se usa el chat que confirmas: si alguien le escribe a tu
     bot después, nunca se usa. Una persona que la pantalla escuchó nunca se vincula sola, solo con tu toque.
5. La pantalla dice *Conectado con tu chat (@ana, id 401234567). Aún no hay copia guardada.*
   Kino también llena el campo **Id del chat** con ese número y lo guarda, como si lo hubieras
   escrito: no escribes nada, y **Enviar a otro aparato** (paso 5) tiene todo lo que necesita. **Cambiar de chat**
   (y la sección *Avanzado*, con el token y el id del chat) están ahí para cuando necesites otro chat.
6. Vuelve atrás. La primera sincronización corre de inmediato: la fila dice *Sincronizado hace un
   momento*, y tu chat con el bot muestra ahora un archivo fijado, `kino-sync.bin`, con el texto
   *Copia de sincronización de Kino. No la borres ni la desfijes.* El plugin la envía y la fija sin
   avisar. Silencia el chat del bot en Telegram para que las copias no te avisen (la pantalla te lo recuerda).
   momento*, y tu chat con el bot muestra ahora un archivo fijado, `kino-sync.bin`, con el texto
   *Copia de sincronización de Kino. No la borres ni la desfijes.* El plugin la envía y la fija sin
   avisar. Silencia el chat del bot en Telegram para que las copias no te avisen.

Desde ahí, Kino trae la copia cuando vuelve al frente y cada 10 minutos, y envía la suya más o menos 5
minutos después de que algo cambie. **Sincronizar ahora** sincroniza en el momento. Cada envío manda
un archivo nuevo, lo fija y borra el anterior, así que el chat guarda una sola copia.

## 5. Agrega tu segundo aparato

El segundo aparato solo necesita los mismos dos ajustes, **Token del bot** e **Id del chat**. Kino saca
la misma llave del mismo token, así que ninguna llave viaja entre tus aparatos, y el segundo aparato
no tiene que escribirle nada al bot.

Con los dos aparatos en el mismo Wi-Fi:

1. Instala el plugin también en el segundo aparato (paso 2), si todavía no está.
2. En el **segundo** aparato (por ejemplo la TV), abre **Ajustes de todos los perfiles ▸
   Sincronización ▸ Proveedor** y toca **Recibir desde otro aparato** debajo de *Sync-Gram*. Durante 3 minutos muestra un código QR, una dirección como
   `192.168.1.`**`23`**`:38917` y un código de 6 cifras.
3. En el **primer** aparato (el celular que ya sincroniza), abre la misma
   pantalla y toca **Enviar a otro aparato**.
   - Apunta la cámara al QR.
   - ¿Sin cámara, o no le diste permiso? Kino pasa a **Escribir dirección**. Escribe el último número
     de la dirección y el código de 6 cifras que muestra el otro aparato, y toca **Enviar**.
   - El celular dice *Enviado. Confírmalo en el otro aparato.*
4. El segundo aparato pregunta **"Recibido para Sync-Gram: ¿aplicar?"**. Muestra
   *Token del bot* e *Id del chat*, nunca sus valores. Toca **Aplicar** y luego **Combinar con este
   aparato**.

¿Están en redes distintas? En la pantalla de envío del celular elige **Otra red** y escribe las
palabras y el código que muestra la TV: la pantalla de recibir abre para eso una ruta temporal por
internet.

En la TV, la página del plugin muestra solo su estado y el botón **Sincronización ▸ Proveedor** de
Kino: la preparación (BotFather, el token, el chat) se dibuja solo en el celular (`"devices": ["phone"]`),
y la TV recibe el token y el id del chat con **Recibir desde otro aparato**.

## Qué pueden leer Telegram y el plugin

- **La copia va cifrada.** Kino la cifra (AES-256-GCM) antes de que el plugin la vea. El archivo de tu
  chat es texto cifrado.
- **Pero la llave sale del token del bot.** Eso es lo que deja que un segundo aparato se una solo con
  el token y el id del chat. Así que **quien tenga el token puede descifrar tus datos**:
  - tú;
  - el plugin, que lee el token para hablar con Telegram;
  - **Telegram**, que emitió el token y guarda el archivo;
  - cualquiera que copie el token de uno de tus aparatos o de tu chat con @BotFather.
- **Qué hay en la copia:** todo lo que Kino sincroniza entre tus aparatos: biblioteca, historial,
  progreso y ajustes, más tus plugins y sus ajustes. Las contraseñas van incluidas, selladas de nuevo
  dentro de la copia.
- **Qué envía el plugin y a dónde:** solo a `api.telegram.org`, por https. El token va en la ruta de la
  dirección, que es como funciona la Bot API (`https://api.telegram.org/bot<token>/<método>`). El
  plugin nunca pone el token en un mensaje de error ni de estado.
- **Qué lee el plugin en Telegram:** mientras la pantalla de configuración está abierta y no hay chat vinculado, los mensajes que la gente le
  envió a tu bot (para encontrar el tuyo); después, solo el archivo fijado de tu chat.

### Cambiar (rotar) el token

Hazlo si el token se filtró, o para dejar fuera un aparato que perdiste.

1. En @BotFather envía `/revoke`, elige tu bot y copia el token **nuevo**. El viejo deja de funcionar
   en el momento.
2. En un aparato: **Conectar**, **Configurar**, abre *Avanzado*, pega el token nuevo, **Guardar**. El id del chat no cambia.
3. Kino encuentra ahora una copia que no puede abrir (*El token no coincide o los datos guardados no
   son de Kino*). Toca **Restablecer sincronización** y confirma. La copia fijada se reemplaza por la
   de este aparato, hecha con el token nuevo.
4. Vuelve a enviar los ajustes a tus otros aparatos (paso 5).

## Límites de la Bot API

- Telegram recibe archivos de hasta **50 MB** de un bot y entrega archivos de hasta **20 MB**. El
  límite de Kino para un proveedor de sincronización es menor: este plugin declara **4 MiB** (4.194.304
  bytes), lo más que Kino deja mover a un proveedor.
- Telegram limita qué tan rápido puede enviar un bot (más o menos un mensaje por segundo en un mismo
  chat). Una ronda de sincronización envía un archivo, muy por debajo de eso. Cuando Telegram sí
  responde *Too Many Requests*, el plugin detiene esa ronda y Kino vuelve a intentar más tarde.
- Telegram solo deja que un bot borre un mensaje durante sus primeras 48 horas. Si una copia vieja no
  se puede borrar, el plugin la desfija; puedes borrarla a mano.

## Si algo falla

| Lo que ves | Qué significa y qué hacer |
| --- | --- |
| *Falta el token: configúralo en Conectar* | Este aparato no tiene el token. Toca **Conectar**, luego **Configurar**, y pégalo. |
| Estado: *Telegram no reconoce el token del bot. Cópialo otra vez de @BotFather.* | El token está mal, incompleto o fue revocado. En @BotFather envía `/token` (o `/revoke` para uno nuevo), cópialo completo y pégalo otra vez. |
| Bajo el campo: *Ese no parece un token de bot…* | Copia solo la línea del token de BotFather: números, dos puntos y el resto, sin espacios y sin `bot` adelante. |
| Estado: *…Falta tu chat: escríbele a tu bot y abre Configurar.* | El token funciona, pero todavía no hay un chat vinculado. Haz el paso 3 de la pantalla de configuración. |
| *Aún no hay mensajes…* en la pantalla de configuración | El bot todavía no recibió nada. Abre el bot en Telegram, toca **Iniciar** y escríbele algo: la pantalla lo encuentra sola. |
| *Otro programa lee este bot (un webhook u otro getUpdates).* | Telegram respondió `409`: el bot está conectado a otro programa o servicio. Crea un bot nuevo solo para Kino (paso 1), o quita el webhook de ese programa. |
| *Tu bot está bloqueado o no lo has iniciado…* | Bloqueaste el bot o nunca tocaste **Iniciar**. Ábrelo en Telegram y toca **Iniciar** o **Desbloquear**. |
| *Telegram no encuentra tu chat: escríbele a tu bot y abre Configurar.* | El id del chat no es el de este bot (un error al escribir **Id del chat**, el token de otro bot, o borraste el chat). Abre **Configurar**, toca **Cambiar de chat**, escríbele al bot y confirma: Kino vuelve a llenar **Id del chat**. |
| *Telegram pide esperar 37 s antes de seguir. Kino lo intentará de nuevo.* | El límite de Telegram (`429`). No hay nada que hacer: Kino vuelve a intentar más tarde. Si lo ves seguido, revisa que ningún otro programa use el mismo bot. |
| *Falló la última sincronización: otro aparato guardaba al mismo tiempo, se volverá a intentar* | Dos aparatos enviaron a la vez, o la copia fijada cambió desde la última vez que este aparato la leyó. Kino trae la copia, combina y vuelve a enviar por su cuenta. |
| La fila dice *Esperando la primera sincronización* y el chat no muestra ningún archivo fijado | Todavía no se envió ninguna copia. Toca **Sincronizar ahora**. |
| Estado: *Hay un mensaje tuyo fijado encima de la copia: desfíjalo en el chat con tu bot. Mientras, Kino guarda una copia nueva.* | Telegram solo le muestra al plugin el mensaje fijado más reciente, y el último fijado es tuyo (un mensaje o un archivo que no envió el bot). El plugin nunca lo lee, lo borra ni lo desfija. Desfíjalo en el chat con tu bot; mientras, Kino fija una copia nueva encima en la próxima sincronización. |
| Borraste o desfijaste `kino-sync.bin` sin querer | El bot queda sin copia. El próximo envío vuelve a guardar la copia de este aparato; no se pierde nada de tus aparatos. No lo borres a propósito: es lo que leen los otros aparatos. |
| *La copia guardada en Telegram es más grande de lo que Kino acepta.* | La copia creció por encima de 4 MiB, lo más que Kino deja mover a un proveedor. Si sigue, **Restablecer sincronización**. |
| *El token no coincide o los datos guardados no son de Kino*, con **Corregir el token** y **Restablecer sincronización** | La copia fijada se hizo con otro token (lo rotaste solo en un aparato). Pon el token actual en este aparato (**Corregir el token**), o **Restablecer sincronización** como en [cambiar el token](#cambiar-rotar-el-token). |

## Para quienes hacen plugins

La sección [For plugin authors](README.md#for-plugin-authors) de la guía en inglés describe el código:
`syncPush` (`getChat` para comparar la versión, `sendDocument` multipart, `pinChatMessage`, una segunda
`getChat` para detectar una carrera, y `deleteMessage` o `unpinChatMessage` de la copia anterior),
`syncPull` (`getChat` ▸ `getFile` ▸ descarga), `syncStatus` (una sola `getChat`), cómo se arma el
cuerpo multipart sin decodificar el blob, el vínculo con `getUpdates`, `action.link` y `setSettings: { chatId }` (Kino guarda el chat confirmado en
el ajuste `chatId`; el token nunca va en una respuesta), la ayuda corta (`help`) y el enlace a @BotFather (`link`), y las pruebas:
`node --test test/*.test.mjs` corre el plugin con el kit de Node de Kino contra `test/telegram-mock.mjs`,
una imitación local de la Bot API, sin red y sin un bot de verdad.
