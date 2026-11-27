// FAQ-Inhalte werden sowohl in der sichtbaren Section als auch im FAQPage-
// JSON-LD verwendet. Antworten knapp und faktisch halten - so übernehmen sie
// Answer-Engines und Generative-Engines (ChatGPT, Perplexity, Google AI
// Overviews, ...) als Zitate.

import type { FaqEntry } from "../../lib/seo";

// Inline-Link für hervorgehobene Verweise in den sichtbaren Antworten.
// Nur für `answerHtml` (Rendering) - der Klartext-`answer` bleibt fürs JSON-LD.
const link = (href: string, label: string): string =>
  `<a href="${href}" class="font-semibold text-arena underline decoration-2 decoration-arena/40 underline-offset-2 transition hover:text-caparol hover:decoration-arena">${label}</a>`;

export const HOME_FAQ: FaqEntry[] = [
  {
    question: "¿Dónde se puede comprar el cuento?",
    answer:
      "Puedes comprarlo dedicado por su autora en el Centro de Danza Sandra Santa Cruz. También en librerías de Gran Canaria como Librería Canaima, La Librería del Cabildo o El Libro Técnico, y en Poema del Mar.\nY puedes adquirirlo online con envío a domicilio a través de El Libro Técnico.\nEn la página Comprar de nuestra web encontrarás el listado actualizado de todos los puntos de venta, junto con su ubicación y la información necesaria para realizar tu compra.",
    answerHtml:
      `Puedes comprarlo dedicado por su autora en el Centro de Danza Sandra Santa Cruz. También en librerías de Gran Canaria como Librería Canaima, La Librería del Cabildo o El Libro Técnico, y en Poema del Mar.\nY puedes adquirirlo online con envío a domicilio a través de El Libro Técnico.\nEn la página ${link("/comprar", "Comprar")} de nuestra web encontrarás el listado actualizado de todos los puntos de venta, junto con su ubicación y la información necesaria para realizar tu compra.`,
  },
  {
    question: "¿A qué edad va dirigido el cuento?",
    answer:
      "El cuento Si los peces hablaran… está dirigido a todas las edades. Puede leerse de forma autónoma a partir de los 6 años, aunque también es una excelente herramienta de sensibilización para familias, centros educativos y público adulto.\nSu lenguaje emotivo y sus ilustraciones permiten que cada lector descubra la historia desde una perspectiva diferente, adaptándose a su edad y nivel de comprensión. Puedes leer gratis el primer capítulo en Lee el capítulo I.",
    answerHtml:
      `El cuento Si los peces hablaran… está dirigido a todas las edades. Puede leerse de forma autónoma a partir de los 6 años, aunque también es una excelente herramienta de sensibilización para familias, centros educativos y público adulto.\nSu lenguaje emotivo y sus ilustraciones permiten que cada lector descubra la historia desde una perspectiva diferente, adaptándose a su edad y nivel de comprensión. Puedes leer gratis el primer capítulo en ${link("/lee-un-fragmento", "Lee el capítulo I")}.`,
  },
  {
    question: "¿Qué es el cuadernillo de actividades?",
    answer:
      "Es el compañero del cuento y la novedad de la 3.ª edición: 15 páginas de laberintos, personajes para colorear, diferencias y dibujos para unir con los animales marinos del cuento, para jugar en casa o en el aula. En la contraportada, siete códigos QR llevan al origen del proyecto, a las investigadoras marinas y a los talleres.\nNació pensando también en los niños de Oncología Infantil. Descúbrelo en El cuadernillo.",
    answerHtml:
      `Es el compañero del cuento y la novedad de la 3.ª edición: 15 páginas de laberintos, personajes para colorear, diferencias y dibujos para unir con los animales marinos del cuento, para jugar en casa o en el aula. En la contraportada, siete códigos QR llevan al origen del proyecto, a las investigadoras marinas y a los talleres.\nNació pensando también en los niños de Oncología Infantil. Descúbrelo en ${link("/cuadernillo", "El cuadernillo")}.`,
  },
  {
    question: "¿Puedo llevarlo a mi colegio o biblioteca?",
    answer:
      "Sí. A los colegios llevamos Talleres SLPH de aproximadamente una hora, de la mano de la autora del cuento, y espectáculos en el propio centro o reuniendo a varios centros en un recinto mayor: lo tienes en Lleva el mar a tu aula.\nA las bibliotecas, una presentación en la que los personajes del cuento cobran vida y la posibilidad de convertirse en Punto Azul. Escríbenos y te preparamos una propuesta a medida.",
    answerHtml:
      `Sí. A los colegios llevamos Talleres SLPH de aproximadamente una hora, de la mano de la autora del cuento, y espectáculos en el propio centro o reuniendo a varios centros en un recinto mayor: lo tienes en ${link("/programa#para-tu-centro", "Lleva el mar a tu aula")}.\nA las bibliotecas, una presentación en la que los personajes del cuento cobran vida y la posibilidad de convertirse en ${link("/colabora#puntos-azules", "Punto Azul")}. Escríbenos y te preparamos una propuesta a medida.`,
  },
  {
    question: "¿Cómo se puede colaborar?",
    answer:
      "Ayuntamientos, organismos, museos y empresas pueden programar nuestras actividades o patrocinar un proyecto: lo diseñamos contigo. Lo tienes todo en Colabora y puedes escribirnos desde Contacto.\nY cualquier persona puede ayudar de la forma más sencilla: contándole a alguien lo que ha aprendido sobre el mar.",
    answerHtml:
      `Ayuntamientos, organismos, museos y empresas pueden programar nuestras actividades o patrocinar un proyecto: lo diseñamos contigo. Lo tienes todo en ${link("/colabora", "Colabora")} y puedes escribirnos desde ${link("/contacto", "Contacto")}.\nY cualquier persona puede ayudar de la forma más sencilla: contándole a alguien lo que ha aprendido sobre el mar.`,
  },
  {
    question: "¿Dónde se desarrolla el proyecto?",
    answer:
      "Tiene su sede en Gran Canaria y ha llegado a Tenerife, La Palma y Fuerteventura… y hasta Colombia. Las fotos de cada lugar están en la Galería.\nTodas las actividades, eventos, colaboraciones y apariciones en los medios de comunicación se publican en Noticias.",
    answerHtml:
      `Tiene su sede en Gran Canaria y ha llegado a Tenerife, La Palma y Fuerteventura… y hasta Colombia. Las fotos de cada lugar están en la ${link("/galeria", "Galería")}.\nTodas las actividades, eventos, colaboraciones y apariciones en los medios de comunicación se publican en ${link("/noticias", "Noticias")}.`,
  },
];
