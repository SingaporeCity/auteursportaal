/**
 * FAQ-data, geport uit demo-portaal. 14 vragen verdeeld over 4 categorieën.
 * HTML in de antwoorden mag inline `<strong>` en `<a>` bevatten — wordt
 * sanitized via DOMPurify bij rendering.
 *
 * @module views/tabs/faq-data
 */

export type FaqCategory = 'payments' | 'documents' | 'data' | 'support';

export interface FaqItem {
  category: FaqCategory;
  question: string;
  answer: string;
}

export const FAQ_CATEGORIES: readonly { id: FaqCategory; label: string }[] = [
  { id: 'payments', label: "Uitbetalingen en royalty's" },
  { id: 'documents', label: 'Documenten' },
  { id: 'data', label: 'Mijn gegevens' },
  { id: 'support', label: 'Ondersteuning' },
];

export const FAQ_ITEMS: readonly FaqItem[] = [
  // -------- Payments --------
  {
    category: 'payments',
    question: 'Wanneer worden mijn uitbetalingen gedaan?',
    answer:
      'Uw royalty-uitbetalingen worden uiterlijk <strong>31 maart</strong> voldaan, gebaseerd op de verkopen van het voorgaande jaar. Nevenrechten en foreign rights worden uiterlijk <strong>31 juli</strong> uitbetaald: nevenrechten na ontvangst van de afdrachten van Stichting UVO, foreign rights na verwerking van de buitenlandse afdrachten via Taylor &amp; Francis. Elke nieuwe afrekening verschijnt direct in dit portaal onder "Afrekeningen".',
  },
  {
    category: 'payments',
    question: 'Hoe wordt mijn royalty berekend?',
    answer:
      'Uw royalty wordt berekend over de <strong>netto-omzet</strong> van uw boek(en), oftewel de omzet minus retouren. Het percentage waarop u recht heeft staat vastgelegd in uw auteurscontract en kan per methode verschillen. Bij meerdere auteurs wordt de royalty verdeeld volgens de auteursaandelen in het contract. De definitieve afrekening volgt jaarlijks in maart.',
  },
  {
    category: 'payments',
    question: 'Wat zijn nevenrechten?',
    answer:
      'Nevenrechten zijn een combinatie van reader- en verhuurgelden. Het betreft inkomsten die Noordhoff ontvangt van Stichting UVO voor readergelden en van bibliotheken voor verhuurgelden, en die naar rato worden doorbetaald aan de auteurs. De hoogte hangt af van wat Stichting UVO en de bibliotheken in dat jaar afdragen; dit kan jaarlijks sterk verschillen.',
  },
  {
    category: 'payments',
    question: 'Wat zijn foreign rights?',
    answer:
      'Foreign rights zijn vergoedingen voor het gebruik van uw werken in het buitenland. Het betreft de distributie van uw werken naar buitenlandse hogescholen en universiteiten, beheerd door <strong>Taylor &amp; Francis</strong>. De afdrachten worden door Noordhoff verzameld en uiterlijk 31 juli aan u doorbetaald.',
  },
  {
    category: 'payments',
    question: 'Hoe wordt mijn prognose berekend?',
    answer:
      'Uw prognose vergelijkt de omzet van uw producten met die van voorgaande jaren en projecteert dat naar het lopende royaltyjaar. De eerste indicatie volgt in <strong>oktober</strong> (wanneer ¾ van het jaar voorbij is); de eindprognose volgt in <strong>januari</strong>. Belangrijk: er wordt alleen op omzet gerekend. Nieuwe producten, contractwijzigingen of veranderende auteursaandelen worden niet automatisch meegenomen. De prognose is <strong>indicatief</strong>; er kunnen geen rechten aan worden ontleend.',
  },
  {
    category: 'payments',
    question: 'Hoe werkt een voorschot?',
    answer:
      'Een voorschot wordt in uitzonderlijke situaties uitbetaald, en altijd in overleg met de uitgever. Het bedrag wordt later verrekend met uw royalty-uitkeringen via de regel <strong>"Aanwending voorschot"</strong> op uw afrekening. Het uitbetaalde bedrag wordt dan in mindering gebracht omdat het voorschot al eerder is voldaan. Verrekening gebeurt <strong>alleen bij de royalty-uitkering</strong>, niet bij nevenrechten of foreign rights. Als de royalty\'s in een jaar lager zijn dan het nog te verrekenen voorschot, blijft het restant staan voor volgende jaren.',
  },

  // -------- Documents --------
  {
    category: 'documents',
    question: 'Wat is de Jaaropgave en wanneer ontvang ik die?',
    answer:
      'De Jaaropgave is een fiscaal overzicht van alle uitbetalingen die Noordhoff in een kalenderjaar aan u heeft gedaan (royalty\'s, nevenrechten en foreign rights samen). U gebruikt hem voor uw opgave bij <strong>LIRA</strong> en voor uw belastingaangifte. De Jaaropgave over jaar X is beschikbaar in de <strong>tweede week van januari</strong> van het jaar erop. Voorheen werd hij per brief verstuurd; tegenwoordig vindt u hem digitaal in dit portaal onder "Afrekeningen", in de groep van het uitbetaaljaar.',
  },
  {
    category: 'documents',
    question: 'Waar vind ik mijn auteurscontract?',
    answer:
      'Al uw auteurscontracten zijn in te zien via het tabblad <strong>"Contracten"</strong>, inclusief eerdere versies en herzieningen. Voor inhoudelijke vragen over een contract neemt u contact op via rights@noordhoff.nl.',
  },

  // -------- Data --------
  {
    category: 'data',
    question: 'Kan ik mijn bankgegevens wijzigen?',
    answer:
      'Ja, u kunt uw bankgegevens wijzigen via het tabblad <strong>"Profiel"</strong>. De wijziging wordt binnen circa <strong>2 weken</strong> in onze administratie verwerkt en geldt voor de eerstvolgende uitbetaling.',
  },
  {
    category: 'data',
    question: 'Hoe gaat Noordhoff om met mijn persoonsgegevens?',
    answer:
      'Noordhoff slaat de persoonsgegevens op die nodig zijn voor uw auteurscontract en de royalty-administratie (NAW, BSN, IBAN/BIC, geboortedatum, telefoon, e-mail). Deze worden volgens fiscale verplichting <strong>7 jaar</strong> bewaard. Uw BSN is in dit portaal gemaskeerd weergegeven en alleen toegankelijk voor de financiële administratie. Voor inzage, correctie of verwijdering van uw gegevens neemt u contact op via rights@noordhoff.nl.',
  },
  {
    category: 'data',
    question: 'Wat moet ik doen als een auteur is overleden?',
    answer:
      "Bij overlijden van een auteur kunnen de erfgenamen dit melden via <strong>rights@noordhoff.nl</strong>. Om royalty's aan de erfgenamen te kunnen overmaken heeft Noordhoff een <strong>Verklaring van Erfrecht</strong> nodig, samen met een kopie van een geldig identiteitsbewijs. Lopende royalty's worden in de tussentijd ingehouden en bewaard. Na ontvangst van de verklaring volgt de eerste uitbetaling binnen circa <strong>2 weken</strong>. De auteurscontracten worden door de erfgenamen overgenomen.",
  },

  // -------- Support --------
  {
    category: 'support',
    question: 'Hoe dien ik een declaratie in?',
    answer:
      'Declaraties dient u in via het tabblad <strong>"Declaraties"</strong> in dit portaal. Declarabel zijn onder andere reiskosten, bureaukosten en redactiewerk. Voeg altijd een ingevulde factuur toe (zie het declaratieformulier in de Declaraties-tab) met daarop uw <strong>Vendor ID</strong>, PO-nummer (indien van toepassing), IBAN, bedrag en of er BTW is gerekend. Goedgekeurde declaraties worden binnen <strong>2 weken</strong> na indiening uitbetaald.',
  },
  {
    category: 'support',
    question: 'Wat doet Noordhoff Academy?',
    answer:
      'Noordhoff Academy biedt cursussen en workshops om uw schrijfkwaliteit te versterken, gericht op didactiek, structuur en digitale leermiddelen. Deelname is <strong>gratis voor auteurs</strong>. Inschrijven kan via de Academy-tegel op uw startpagina, of direct via <a href="https://noordhoffacademy.nl/" target="_blank" rel="noopener noreferrer">noordhoffacademy.nl</a>. Het aanbod is bedoeld voor zowel nieuwe als ervaren auteurs.',
  },
  {
    category: 'support',
    question: 'Hoe kan ik contact opnemen met Noordhoff?',
    answer:
      'Voor vragen over royalties, contracten of dit portaal: <strong>rights@noordhoff.nl</strong>. Voor het indienen van facturen: <strong>crediteuren@noordhoff.nl</strong>. Telefonisch op werkdagen tussen 9:00 en 17:00 via <strong>(050) 522 69 22</strong>. Wij streven ernaar binnen <strong>2 werkdagen</strong> te reageren.',
  },
];
