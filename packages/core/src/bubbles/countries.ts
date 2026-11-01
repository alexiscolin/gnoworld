// The countries a bubble can come from: an ISO 3166-1 alpha-2 code, a name and a centre in degrees.
// Source: Natural Earth (public domain, https://www.naturalearthdata.com/about/terms-of-use/), release 5.1.2, read from
// https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson: ne_10m_admin_0_countries (ISO_A2_EH, NAME_EN,
// LABEL_Y, LABEL_X; one row a code, the feature of the lowest LABELRANK) and, for eleven overseas territories that file folds
// into their state, ne_10m_admin_0_map_units. The centre is the source's label point to a tenth of a degree. Bonaire,
// Sint Eustatius and Saba (BQ, "Caribbean Netherlands") are in the map units file: LABEL_Y 17.5438, LABEL_X -63.1334.
export interface Country {
  readonly code: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

// Rows of "code,name,lat,lon" joined by ";", in code order, packed to keep the file short.
const ROWS = [
  "AD,Andorra,42.5,1.5;AE,United Arab Emirates,23.5,54.5;AF,Afghanistan,34.2,66.5;",
  "AG,Antigua and Barbuda,17.4,-61.8;AI,Anguilla,18.2,-63.0;AL,Albania,40.7,20.1;AM,Armenia,40.5,44.8;",
  "AO,Angola,-12.2,18.0;AQ,Antarctica,-79.8,35.9;AR,Argentina,-33.5,-64.2;AS,American Samoa,-14.3,-170.7;",
  "AT,Austria,47.5,14.1;AU,Australia,-24.1,134.0;AW,Aruba,12.5,-70.0;AX,Åland,60.2,19.9;",
  "AZ,Azerbaijan,40.4,47.2;BA,Bosnia and Herzegovina,44.1,18.1;BB,Barbados,13.2,-59.6;",
  "BD,Bangladesh,24.2,89.7;BE,Belgium,50.8,4.8;BF,Burkina Faso,12.7,-1.4;BG,Bulgaria,42.5,25.2;",
  "BH,Bahrain,26.1,50.6;BI,Burundi,-3.3,29.9;BJ,Benin,10.3,2.4;BL,Saint Barthélemy,17.9,-62.8;",
  "BM,Bermuda,32.3,-64.8;BN,Brunei,4.4,114.6;BO,Bolivia,-16.7,-64.6;BQ,Caribbean Netherlands,17.5,-63.1;BR,Brazil,-12.1,-49.6;",
  "BS,The Bahamas,26.4,-77.1;BT,Bhutan,27.5,90.0;BV,Bouvet Island,-54.4,3.4;BW,Botswana,-22.1,24.2;",
  "BY,Belarus,53.8,28.4;BZ,Belize,17.2,-88.7;CA,Canada,60.3,-101.9;CC,Cocos (Keeling) Islands,-12.2,96.8;",
  "CD,Democratic Republic of the Congo,-1.9,23.5;CF,Central African Republic,7.0,20.9;",
  "CG,Republic of the Congo,0.1,15.9;CH,Switzerland,46.7,7.5;CI,Ivory Coast,7.5,-5.6;",
  "CK,Cook Islands,-21.2,-159.8;CL,Chile,-38.2,-72.3;CM,Cameroon,4.6,12.5;",
  "CN,People's Republic of China,32.5,106.3;CO,Colombia,3.4,-73.2;CR,Costa Rica,10.1,-84.1;",
  "CU,Cuba,21.3,-78.0;CV,Cape Verde,15.1,-23.6;CW,Curaçao,12.1,-68.9;CX,Christmas Island,-10.5,105.7;",
  "CY,Cyprus,34.9,33.1;CZ,Czech Republic,49.9,15.4;DE,Germany,51.0,9.7;DJ,Djibouti,12.0,42.5;",
  "DK,Denmark,56.0,9.0;DM,Dominica,15.5,-61.3;DO,Dominican Republic,19.1,-70.7;DZ,Algeria,27.4,2.8;",
  "EC,Ecuador,-1.3,-78.2;EE,Estonia,58.7,25.9;EG,Egypt,26.2,29.4;EH,Western Sahara,24.0,-12.6;",
  "ER,Eritrea,15.8,38.3;ES,Spain,40.1,-3.5;ET,Ethiopia,8.0,39.1;FI,Finland,63.3,27.3;FJ,Fiji,-17.8,178.0;",
  "FK,Falkland Islands,-51.6,-58.7;FM,Federated States of Micronesia,6.9,158.2;FO,Faroe Islands,62.2,-7.1;",
  "FR,France,46.7,2.6;GA,Gabon,-0.4,11.8;GB,United Kingdom,54.4,-2.1;GD,Grenada,12.1,-61.7;",
  "GE,Georgia,41.9,43.7;GF,French Guiana,4.0,-53.1;GG,Guernsey,49.5,-2.6;GH,Ghana,7.7,-1.0;",
  "GI,Gibraltar,36.1,-5.3;GL,Greenland,74.3,-39.3;GM,The Gambia,13.6,-15.0;GN,Guinea,10.6,-10.0;",
  "GP,Guadeloupe,16.3,-61.4;GQ,Equatorial Guinea,2.3,9.0;GR,Greece,39.5,21.7;",
  "GS,South Georgia and the South Sandwich Islands,-55.7,-31.1;GT,Guatemala,15.0,-90.5;GU,Guam,13.4,144.7;",
  "GW,Guinea-Bissau,12.2,-14.5;GY,Guyana,5.1,-58.9;HK,Hong Kong,22.4,114.1;",
  "HM,Heard Island and McDonald Islands,-53.1,73.5;HN,Honduras,14.8,-86.9;HR,Croatia,45.8,16.4;",
  "HT,Haiti,19.3,-72.2;HU,Hungary,47.1,19.4;ID,Indonesia,-1.0,101.9;IE,Ireland,53.1,-7.8;",
  "IL,Israel,30.9,34.8;IM,Isle of Man,54.2,-4.5;IN,India,22.7,79.4;",
  "IO,British Indian Ocean Territory,-6.2,71.3;IQ,Iraq,33.1,43.3;IR,Iran,32.2,54.9;IS,Iceland,64.8,-18.7;",
  "IT,Italy,44.7,11.1;JE,Jersey,49.2,-2.1;JM,Jamaica,18.1,-77.3;JO,Jordan,30.8,36.4;JP,Japan,36.1,138.4;",
  "KE,Kenya,0.5,37.9;KG,Kyrgyzstan,41.7,74.5;KH,Cambodia,12.6,104.5;KI,Kiribati,1.8,-157.4;",
  "KM,Comoros,-11.7,43.3;KN,Saint Kitts and Nevis,17.3,-62.8;KP,North Korea,39.9,126.4;",
  "KR,South Korea,36.4,128.1;KW,Kuwait,29.4,47.3;KY,Cayman Islands,19.3,-81.2;KZ,Kazakhstan,49.1,68.7;",
  "LA,Laos,19.4,102.5;LB,Lebanon,34.1,36.0;LC,Saint Lucia,13.9,-61.0;LI,Liechtenstein,47.1,9.6;",
  "LK,Sri Lanka,7.6,80.7;LR,Liberia,6.4,-9.5;LS,Lesotho,-29.5,28.2;LT,Lithuania,55.1,24.1;",
  "LU,Luxembourg,49.7,6.1;LV,Latvia,57.1,25.5;LY,Libya,26.6,18.0;MA,Morocco,31.7,-7.2;MC,Monaco,43.7,7.4;",
  "MD,Moldova,47.4,28.5;ME,Montenegro,42.8,19.1;MF,Saint Martin,18.1,-63.0;MG,Madagascar,-18.6,46.7;",
  "MH,Marshall Islands,7.1,171.2;MK,North Macedonia,41.6,21.6;ML,Mali,18.7,-2.0;MM,Myanmar,21.6,95.8;",
  "MN,Mongolia,46.0,104.2;MO,Macau,22.1,113.6;MP,Northern Mariana Islands,15.2,145.7;",
  "MQ,Martinique,14.7,-61.1;MR,Mauritania,19.6,-9.7;MS,Montserrat,16.7,-62.2;MT,Malta,35.9,14.4;",
  "MU,Mauritius,-20.3,57.6;MV,Maldives,4.2,73.5;MW,Malawi,-13.4,33.6;MX,Mexico,23.9,-102.3;",
  "MY,Malaysia,2.5,113.8;MZ,Mozambique,-13.9,37.8;NA,Namibia,-20.6,17.1;NC,New Caledonia,-21.1,165.1;",
  "NE,Niger,17.4,9.5;NF,Norfolk Island,-29.0,168.0;NG,Nigeria,9.4,7.5;NI,Nicaragua,12.7,-85.1;",
  "NL,Netherlands,52.4,5.6;NO,Norway,61.4,9.7;NP,Nepal,28.3,83.6;NR,Nauru,-0.5,166.9;NU,Niue,-19.0,-169.9;",
  "NZ,New Zealand,-39.8,172.8;OM,Oman,22.1,57.3;PA,Panama,8.7,-80.4;PE,Peru,-13.0,-72.9;",
  "PF,French Polynesia,-17.6,-149.5;PG,Papua New Guinea,-5.7,143.9;PH,Philippines,11.2,122.5;",
  "PK,Pakistan,29.3,68.5;PL,Poland,52.0,19.5;PM,Saint Pierre and Miquelon,47.0,-56.3;",
  "PN,Pitcairn Islands,-24.4,-128.3;PR,Puerto Rico,18.2,-66.5;PS,Palestine,32.0,35.3;PT,Portugal,39.6,-8.3;",
  "PW,Palau,7.5,134.6;PY,Paraguay,-21.7,-60.1;QA,Qatar,25.2,51.1;RE,Réunion,-21.1,55.5;RO,Romania,45.7,25.0;",
  "RS,Serbia,44.2,20.8;RU,Russia,58.2,44.7;RW,Rwanda,-1.9,30.1;SA,Saudi Arabia,23.8,44.7;",
  "SB,Solomon Islands,-8.0,159.2;SC,Seychelles,-4.7,55.5;SD,Sudan,16.3,29.3;SE,Sweden,65.9,19.0;",
  "SG,Singapore,1.4,103.8;SH,Saint Helena,-16.0,-5.7;SI,Slovenia,46.1,14.9;SJ,Svalbard,78.8,18.1;",
  "SK,Slovakia,48.7,19.0;SL,Sierra Leone,8.6,-11.8;SM,San Marino,43.9,12.4;SN,Senegal,15.1,-14.8;",
  "SO,Somalia,3.6,45.2;SR,Suriname,4.1,-55.9;SS,South Sudan,7.2,30.4;ST,São Tomé and Príncipe,1.0,7.0;",
  "SV,El Salvador,13.7,-88.9;SX,Sint Maarten,18.0,-63.1;SY,Syria,35.0,38.3;SZ,Eswatini,-26.5,31.5;",
  "TC,Turks and Caicos Islands,21.8,-71.8;TD,Chad,15.1,18.6;",
  "TF,French Southern and Antarctic Lands,-49.3,69.1;TG,Togo,8.8,1.1;TH,Thailand,15.5,101.1;",
  "TJ,Tajikistan,38.2,72.6;TK,Tokelau,-8.6,-172.5;TL,East Timor,-8.8,125.9;TM,Turkmenistan,39.9,58.7;",
  "TN,Tunisia,33.7,9.0;TO,Tonga,-21.2,-175.2;TR,Turkey,39.3,34.5;TT,Trinidad and Tobago,11.0,-60.9;",
  "TV,Tuvalu,-8.5,179.2;TW,Taiwan,23.7,120.9;TZ,Tanzania,-6.1,35.0;UA,Ukraine,49.7,32.1;UG,Uganda,2.0,32.9;",
  "UM,United States Minor Outlying Islands,19.3,166.6;US,United States of America,39.5,-97.5;",
  "UY,Uruguay,-33.0,-56.0;UZ,Uzbekistan,41.7,64.0;VA,Vatican City,41.9,12.5;",
  "VC,Saint Vincent and the Grenadines,13.1,-61.3;VE,Venezuela,7.2,-64.6;",
  "VG,British Virgin Islands,18.4,-64.6;VI,United States Virgin Islands,17.7,-64.8;VN,Vietnam,21.7,105.4;",
  "VU,Vanuatu,-15.4,166.9;WF,Wallis and Futuna,-14.3,-178.1;WS,Samoa,-13.6,-172.4;XK,Kosovo,42.6,20.9;",
  "YE,Yemen,15.3,45.9;YT,Mayotte,-12.8,45.2;ZA,South Africa,-29.7,23.7;ZM,Zambia,-14.7,26.4;",
  "ZW,Zimbabwe,-18.9,29.9",
];

function parse(row: string): Country {
  const [code = "", name = "", lat = "", lon = ""] = row.split(",");
  return { code, name, lat: Number(lat), lon: Number(lon) };
}

export const COUNTRIES: readonly Country[] = ROWS.join("").split(";").map(parse);

const BY_CODE: Readonly<Record<string, Country>> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

/** The centre of a country (a copy), or nothing for a code the table does not hold: a code is never guessed. */
export function centreOf(code: string | undefined): { lat: number; lon: number } | undefined {
  const country = code !== undefined && Object.hasOwn(BY_CODE, code) ? BY_CODE[code] : undefined;
  return country === undefined ? undefined : { lat: country.lat, lon: country.lon };
}
