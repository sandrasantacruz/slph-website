- fotos einen namen geben
- fotos auch eine bildbeschreibung geben
- http://localhost:4321/lee-un-fragmento - video mit dem buch anders machen



- backend: datenüberarbeiten datum, etc.
- backend: wenn archivo auch mit über detail seite anzeigen

- video tobias web: home direkt nach hero: https://drive.google.com/drive/folders/1-ixe1s__uQ1NHIgPjKXqJF5mgTqB80JV?hl=es
- trailer in http://localhost:4321/lee-un-fragmento
- video kind liest: comprar libro
- mission nach oben http://localhost:4321/programa und fisch ausaustaschen mit megaphone
- http://localhost:4321/comprar reviews mit einfügen, text und videos
    - https://www.youtube.com/watch?v=sLhA88EUVDU
    - https://www.youtube.com/watch?v=GkmiiCa8qCU

- contact email zu lang
- buch: eine seite vor prologo - 27
- foto sandra http://localhost:4321/autor

http://localhost:4321/repercusion die zwei youtube videos setzen
- https://youtu.be/sLhA88EUVDU?si=q9s0A3HTsnxWMybX
el musical, en directo por: centros escolares
- https://youtu.be/GkmiiCa8qCU?si=GEwIMve37QbstajJ
y los peces… hablaron por: investigadoras marinas


```bash
magick -density 200 "book.pdf[0,9-25,146]" \
  -profile "/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc" \
  -profile "/System/Library/ColorSync/Profiles/sRGB Profile.icc" \
  -colorspace sRGB \
  -resize '1500x1500>' -strip -quality 85 \
  +adjoin -scene 1 '%d.webp'
for f in [0-9].webp; do mv "$f" "0$f"; done
```