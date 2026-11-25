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
      "Si los peces hablaran… (SLPH) es un programa multidisciplinar de concienciación marina creado en Gran Canaria por Sandra Santa Cruz. Une las artes plásticas y escénicas, las ciencias del mar y la educación para proteger los ecosistemas marinos.\nNació en 2016 como un musical en el Centro de Danza Sandra Santa Cruz y, gracias a su repercusión, se convirtió en un programa con cuento ilustrado, talleres, espectáculos y acciones culturales para todos los públicos.",
    answerHtml:
      `Si los peces hablaran… (SLPH) es un programa multidisciplinar de concienciación marina creado en Gran Canaria por Sandra Santa Cruz. Une las artes plásticas y escénicas, las ciencias del mar y la educación para proteger los ecosistemas marinos.\nNació en 2016 como ${link("/galeria#musical", "un musical")} en el Centro de Danza Sandra Santa Cruz y, gracias a su repercusión, se convirtió en un programa con cuento ilustrado, talleres, espectáculos y acciones culturales para todos los públicos.`,
  },
  {
    question: "¿Quién es la autora?",
    answer:
      "Sandra Santa Cruz es bailarina, coreógrafa, profesora y licenciada en danza. Desde hace casi cuatro décadas dirige el Centro de Danza Sandra Santa Cruz, en Gran Canaria, donde promueve la danza como herramienta educativa, artística y de desarrollo personal.\nEscribió el cuento Si los peces hablaran… y dirige el Programa SLPH desde que se estrenó como musical en 2016.",
    answerHtml:
      `Sandra Santa Cruz es bailarina, coreógrafa, profesora y licenciada en danza. Desde hace casi cuatro décadas dirige el Centro de Danza Sandra Santa Cruz, en Gran Canaria, donde promueve la danza como herramienta educativa, artística y de desarrollo personal.\nEscribió el cuento Si los peces hablaran… y dirige el Programa SLPH desde que se estrenó como musical en 2016. Conoce su trayectoria en ${link("/autor", "La autora")}.`,
  },
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
      "El cuento Si los peces hablaran… está dirigido a todas las edades. Puede leerse de forma autónoma a partir de los 6 años, aunque también es una excelente herramienta de sensibilización para familias, centros educativos y público adulto.\nSu lenguaje emotivo y sus ilustraciones permiten que cada lector descubra la historia desde una perspectiva diferente, adaptándose a su edad y nivel de comprensión. Puedes leer gratis el primer capítulo en Lee un fragmento.",
    answerHtml:
      `El cuento Si los peces hablaran… está dirigido a todas las edades. Puede leerse de forma autónoma a partir de los 6 años, aunque también es una excelente herramienta de sensibilización para familias, centros educativos y público adulto.\nSu lenguaje emotivo y sus ilustraciones permiten que cada lector descubra la historia desde una perspectiva diferente, adaptándose a su edad y nivel de comprensión. Puedes leer gratis el primer capítulo en ${link("/lee-un-fragmento", "Lee un fragmento")}.`,
  },
  {
    question: "¿En qué consiste el programa SLPH?",
    answer:
      "Funciona a través de distintos formatos que se adaptan a cada público: talleres en museos, bibliotecas y colegios; musicales y espectáculos; conferencias con investigadoras marinas; exposiciones, y materiales didácticos como el cuento y su cuadernillo de actividades.\nSus contenidos científicos cuentan con la supervisión de investigadoras del Instituto ECOAQUA de la Universidad de Las Palmas de Gran Canaria, lo que garantiza el rigor de sus mensajes.",
    answerHtml:
      `Funciona a través de distintos formatos que se adaptan a cada público: talleres en museos, bibliotecas y colegios; musicales y espectáculos; conferencias con investigadoras marinas; exposiciones, y materiales didácticos como el cuento y su cuadernillo de actividades.\nSus contenidos científicos cuentan con la supervisión de investigadoras del Instituto ECOAQUA de la Universidad de Las Palmas de Gran Canaria, lo que garantiza el rigor de sus mensajes. Descubre todos los formatos en ${link("/programa", "El programa")}.`,
  },
  {
    question: "¿Cómo se puede colaborar?",
    answer:
      "Puedes colaborar con Si los peces hablaran… de diferentes maneras: haciendo voluntariado en nuestros eventos, realizando una donación puntual o mediante acciones de mecenazgo y colaboración institucional.\nEn la página Colabora encontrarás toda la información sobre las distintas formas de participar. Si deseas resolver alguna duda o proponer una colaboración, puedes contactar directamente con nosotros a través de WhatsApp, correo electrónico o teléfono, disponibles en la página Contacto.",
    answerHtml:
      `Puedes colaborar con Si los peces hablaran… de diferentes maneras: haciendo voluntariado en nuestros eventos, realizando una donación puntual o mediante acciones de mecenazgo y colaboración institucional.\nEn la página ${link("/colabora", "Colabora")} encontrarás toda la información sobre las distintas formas de participar. Si deseas resolver alguna duda o proponer una colaboración, puedes contactar directamente con nosotros a través de WhatsApp, correo electrónico o teléfono, disponibles en la página ${link("/contacto", "Contacto")}.`,
  },
  {
    question: "¿Dónde se desarrolla el proyecto?",
    answer:
      "Tiene su sede en Gran Canaria (España) y sus actividades han llegado también a Fuerteventura, Tenerife y La Palma, con proyección a todo el territorio nacional. Las fotos de cada lugar están en la Galería.\nTodas las actividades, eventos, colaboraciones y apariciones en los medios de comunicación se publican en la sección Noticias de nuestra web.",
    answerHtml:
      `Tiene su sede en Gran Canaria (España) y sus actividades han llegado también a Fuerteventura, Tenerife y La Palma, con proyección a todo el territorio nacional. Las fotos de cada lugar están en la ${link("/galeria", "Galería")}.\nTodas las actividades, eventos, colaboraciones y apariciones en los medios de comunicación se publican en la sección ${link("/noticias", "Noticias")} de nuestra web.`,
  },
];
