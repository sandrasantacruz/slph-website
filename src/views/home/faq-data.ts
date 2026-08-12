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
      "Si los peces hablaran… (SLPH) es un programa de concienciación medioambiental creado en Gran Canaria por Sandra Santa Cruz. Su misión es promover la protección y conservación de los ecosistemas marinos a través de la unión de tres ámbitos complementarios: las artes plásticas y escénicas, las ciencias del mar y la educación.\nEl proyecto nació como un musical y, con el paso del tiempo, ha evolucionado hasta convertirse en un programa multidisciplinar que incluye un cuento ilustrado, talleres educativos, performances, acciones culturales y eventos de sensibilización dirigidos a todos los públicos.",
  },
  {
    question: "¿Quién es la autora?",
    answer:
      "Sandra Santa Cruz es bailarina, coreógrafa, profesora y licenciada en danza. Desde hace casi cuatro décadas dirige el Centro de Danza Sandra Santa Cruz, en Gran Canaria, donde promueve la danza como herramienta educativa, artística y de desarrollo personal.\nEs la autora del cuento Si los peces hablaran… y la creadora e impulsora del Programa SLPH, un programa que une artes escénicas, educación y ciencia del mar para fomentar el respeto y la conservación del mundo marino.",
  },
  {
    question: "¿Dónde se puede comprar el cuento?",
    answer:
      "El cuento Si los peces hablaran… está disponible en diferentes puntos de venta de Gran Canaria, entre ellos Librería Canaima, La Librería del Cabildo, Poema del Mar y El Libro Técnico.\nTambién puedes adquirirlo online con envío a domicilio a través de El Libro Técnico.\nEn la página Comprar de nuestra web encontrarás el listado actualizado de todos los puntos de venta, junto con su ubicación y la información necesaria para realizar tu compra.",
    answerHtml:
      `El cuento Si los peces hablaran… está disponible en diferentes puntos de venta de Gran Canaria, entre ellos Librería Canaima, La Librería del Cabildo, Poema del Mar y El Libro Técnico.\nTambién puedes adquirirlo online con envío a domicilio a través de El Libro Técnico.\nEn la página ${link("/comprar", "Comprar")} de nuestra web encontrarás el listado actualizado de todos los puntos de venta, junto con su ubicación y la información necesaria para realizar tu compra.`,
  },
  {
    question: "¿A qué edad va dirigido el cuento?",
    answer:
      "El cuento Si los peces hablaran… está dirigido a todas las edades. Puede leerse de forma autónoma a partir de los 6 años, aunque también es una excelente herramienta de sensibilización para familias, centros educativos y público adulto.\nSu lenguaje emotivo y sus ilustraciones permiten que cada lector descubra la historia desde una perspectiva diferente, adaptándose a su edad y nivel de comprensión.",
  },
  {
    question: "¿En qué consiste el programa SLPH?",
    answer:
      "El programa Si los peces hablaran… (SLPH) utiliza las artes plásticas, las artes escénicas, la educación y las ciencias del mar como herramientas para fomentar la protección y conservación de los ecosistemas marinos.\nTodos sus contenidos cuentan con la supervisión científica de investigadoras de la Facultad de Ciencias del Mar de la Universidad de Las Palmas de Gran Canaria, garantizando el rigor de los mensajes que transmite.\nEl programa incluye talleres educativos, exposiciones, espectáculos, materiales didácticos y otras acciones de sensibilización dirigidas a centros escolares, familias e instituciones.",
  },
  {
    question: "¿Cómo se puede colaborar?",
    answer:
      "Puedes colaborar con Si los peces hablaran… de diferentes maneras: como voluntario, realizando una donación puntual o mediante acciones de mecenazgo y colaboración institucional.\nEn la página Colabora encontrarás toda la información sobre las distintas formas de participar. Si deseas resolver alguna duda o proponer una colaboración, puedes contactar directamente con nosotros a través de WhatsApp, correo electrónico o teléfono, disponibles en la página Contacto.",
    answerHtml:
      `Puedes colaborar con Si los peces hablaran… de diferentes maneras: como voluntario, realizando una donación puntual o mediante acciones de mecenazgo y colaboración institucional.\nEn la página ${link("/colabora", "Colabora")} encontrarás toda la información sobre las distintas formas de participar. Si deseas resolver alguna duda o proponer una colaboración, puedes contactar directamente con nosotros a través de WhatsApp, correo electrónico o teléfono, disponibles en la página ${link("/contacto", "Contacto")}.`,
  },
  {
    question: "¿Dónde se desarrolla el proyecto?",
    answer:
      "El proyecto se desarrolla principalmente en Gran Canaria (España), con presencia en el archipiélago canario y con proyección al territorio nacional.\nTodas las actividades, eventos, colaboraciones y apariciones en los medios de comunicación se publican en la sección Noticias de nuestra web.",
    answerHtml:
      `El proyecto se desarrolla principalmente en Gran Canaria (España), con presencia en el archipiélago canario y con proyección al territorio nacional.\nTodas las actividades, eventos, colaboraciones y apariciones en los medios de comunicación se publican en la sección ${link("/noticias", "Noticias")} de nuestra web.`,
  },
];
