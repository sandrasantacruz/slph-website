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
    question: "¿Qué es Si los peces hablaran…?",
    answer:
      "Si los peces hablaran… (SLPH) es un programa de concienciación medioambiental creado en Gran Canaria por Sandra Santa Cruz. Protege los ecosistemas marinos a través de tres lenguajes complementarios: las artes plásticas y escénicas, las ciencias del mar y la educación. Nació como musical y se ha expandido a un cuento, talleres educativos, performances y eventos de concienciación.",
  },
  {
    question: "¿Quién es la autora?",
    answer:
      "Sandra Santa Cruz es bailarina, coreógrafa y profesora canaria, licenciada en danza. Lleva más de tres décadas al frente del Centro de Danza Sandra Santa Cruz en Gran Canaria, donde fomenta la danza como herramienta educativa. Es la autora del cuento Si los peces hablaran… y la impulsora del programa homónimo.",
  },
  {
    question: "¿Dónde se puede comprar el cuento?",
    answer:
      "El cuento está disponible de forma presencial en librerías de Gran Canaria, entre ellas, Librería Canaima, La Librería del Cabildo, Poema del Mar y El Libro Técnico, donde lo encontrarás también de forma online con envío a domicilio. La página comprar lista los puntos de venta con su dirección.",
    answerHtml:
      `El cuento está disponible de forma presencial en librerías de Gran Canaria, entre ellas, Librería Canaima, La Librería del Cabildo, Poema del Mar y El Libro Técnico, donde lo encontrarás también de forma online con envío a domicilio. La página ${link("/comprar", "comprar")} lista los puntos de venta con su dirección.`,
  },
  {
    question: "¿A qué edad va dirigido el cuento?",
    answer:
      "El relato de Si los peces hablaran… va dirigido a todas las edades. Está pensado como cuento ilustrado de lectura a partir de 6 años, y como herramienta de sensibilización para familias, docentes y público adulto. Su lenguaje emotivo y sus ilustraciones permiten una lectura por capas según la edad.",
  },
  {
    question: "¿En qué consiste el programa SLPH?",
    answer:
      "El programa SLPH combina artes plásticas, artes escénicas y ciencia del mar para concienciar sobre los ecosistemas marinos. Los contenidos están supervisados por la Facultad de Ciencias del Mar de la Universidad de Las Palmas de Gran Canaria. Incluye talleres educativos, exposiciones, un musical y materiales didácticos para centros escolares.",
  },
  {
    question: "¿Cómo se puede colaborar?",
    answer:
      "Se puede colaborar de tres formas: como voluntario, como donante puntual o a través de mecenazgo institucional. La página colabora explica los detalles y la página de contacto recoge los canales directos (WhatsApp, correo y teléfono) para ponerse en contacto sin formularios intermedios.",
    answerHtml:
      `Se puede colaborar de tres formas: como voluntario, como donante puntual o a través de mecenazgo institucional. La página ${link("/colabora", "colabora")} explica los detalles y la página de contacto recoge los canales directos (WhatsApp, correo y teléfono) para ponerse en contacto sin formularios intermedios.`,
  },
  {
    question: "¿Dónde se desarrolla el proyecto?",
    answer:
      "El proyecto se desarrolla principalmente en Gran Canaria (España), con presencia en el archipiélago canario y con proyección al territorio nacional. Las actividades, eventos y notas de prensa se publican en la sección noticias de la web.",
    answerHtml:
      `El proyecto se desarrolla principalmente en Gran Canaria (España), con presencia en el archipiélago canario y con proyección al territorio nacional. Las actividades, eventos y notas de prensa se publican en la sección ${link("/noticias", "noticias")} de la web.`,
  },
];
