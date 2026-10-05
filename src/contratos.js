import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
router.use(express.json());

// Ruta para generar la vista previa HTML desde el formulario
router.post("/generar-vista-previa", (req, res) => {
  const d = req.body;

  // Lógica para adaptar la plantilla según los selectores
  d.es_renovacion = d.tipo_operacion === "renovacion";
  d.es_comercial = d.destino === "comercial";

  // Plantilla maestra con TODAS las cláusulas de los modelos provistos
  const templateHtml = `
        <div style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; text-align: justify; padding: 20px;">
            <h2 style="text-align: center; text-decoration: underline; margin-bottom: 20px;">
                {{#if es_renovacion}}RENOVACIÓN DE {{/if}}CONTRATO DE LOCACIÓN
            </h2>
            
            <p>Entre el/la SR./SRA. <strong>{{locador_nombre}}</strong>, DNI N° {{locador_dni}}, con domicilio real en {{locador_domicilio}}, por una parte y en adelante denominada la LOCADORA; y el/la SR./SRA. <strong>{{locatario_nombre}}</strong>, DNI N° {{locatario_dni}}, con domicilio en {{locatario_domicilio}}, por la otra parte y en adelante denominada la LOCATARIA; convienen en celebrar el presente contrato de locación, que se regirá por las siguientes cláusulas:</p>

            <p><strong>PRIMERA: LEGISLACIÓN APLICABLE.</strong> El presente contrato se encuentra regido por: A) El DECRETO DE NECESIDAD Y URGENCIA (DNU) 70/2023 "BASES PARA LA RECONSTRUCCIÓN DE LA ECONOMÍA ARGENTINA", dictado por el Poder Ejecutivo Nacional el 20 de diciembre de 2023 y Publicado en el Boletín Oficial del día 21 de diciembre de 2023, Número: 35326 Página: 3. Decreto que comenzó a regir el día 29 de diciembre de 2023; B) Ley 26.994, Código Civil y Comercial de la Nación (CCCN) y C) Leyes complementarias.</p>

            <p><strong>SEGUNDA: MANDATO.</strong> Las obligaciones que asume la parte LOCATARIA son indivisibles y solidarias. En consecuencia, se facultan recíproca e irrevocablemente para que cualquiera de ellos pueda válidamente, sin la conformidad del otro, convenir con la parte LOCADORA la rescisión del contrato de locación o resolver unilateralmente el mismo.</p>

            <p><strong>TERCERA: OBJETO{{#if es_renovacion}} Y CONTINUIDAD{{/if}}.</strong><br>
            {{#if es_renovacion}}
                Las partes declaran que el presente instrumento constituye la renovación directa del contrato de locación originalmente celebrado entre ellas. Atento a que la LOCATARIA se encuentra en tenencia ininterrumpida del inmueble, ambas partes acuerdan expresamente prescindir de la confección de un nuevo inventario escrito o fotográfico para este acto. Por lo tanto, se establece de mutuo acuerdo que el inventario detallado y las condiciones generales del estado del inmueble anexados al contrato original conservan plena vigencia jurídica. La LOCADORA renueva en locación a la LOCATARIA el inmueble ubicado en <strong>{{inmueble_direccion}}</strong>. Inmueble inscripto en la Administración Tributaria de Mendoza bajo el número de padrón <strong>{{inmueble_padron}}</strong>. El inmueble consta de: {{inmueble_detalle}}.
            {{else}}
                La LOCADORA entrega en locación a la LOCATARIA y ésta recibe en carácter de tal, un inmueble ubicado en <strong>{{inmueble_direccion}}</strong>. Inmueble inscripto en la Administración Tributaria de Mendoza bajo el número de padrón <strong>{{inmueble_padron}}</strong>. El inmueble consta de: {{inmueble_detalle}}.<br>
                En el inmueble alquilado se suministran los siguientes servicios: a) agua corriente y cloacas, b) gas natural y c) energía eléctrica.<br>
                Las ventanas y puertas se entregan con sus herrajes, vidrios y rejas, en perfecto estado. Todas las puertas del inmueble alquilado se entregan con sus herrajes y llaves, en perfecto estado. Todos los bienes muebles y/o accesorios detallados se entregan en perfecto estado de conservación y uso.
            {{/if}}
            </p>

            <p><strong>CUARTA: DESTINO.</strong><br> 
            La LOCATARIA destinará el inmueble locado exclusivamente para <strong>{{#if es_comercial}}USO COMERCIAL{{else}}VIVIENDA FAMILIAR / PERSONAL{{/if}}</strong>. El destino acordado no podrá ser alterado ni cambiado bajo ningún pretexto y en condición alguna.
            {{#if es_comercial}}
            {{else}}
                La LOCATARIA se obliga a usar y gozar el inmueble alquilado, únicamente, con las siguientes personas: {{personas_convivientes}}.
            {{/if}}
            La violación de lo acordado en esta cláusula faculta a la LOCADORA para rescindir el contrato de locación, interponiendo la pertinente demanda de desalojo, con pedido de expresa imposición de costos y costas a cargo de la LOCATARIA y los CODEUDORES, solidariamente.
            </p>

            <p><strong>QUINTA: OTRO DESTINO – CONTRIBUCIONES.</strong> Si el destino no es vivienda, restantes destinos, toda tasa, patente, multa, impuesto, gastos o cualquier tipo de contribución que deba soportar este contrato o el inmueble arrendado con motivo del destino de esta locación será de cargo exclusivo de la LOCATARIA. La LOCATARIA deberá pagar regularmente las patentes o derechos de habilitación. Concluido el contrato de locación, la LOCATARIA deberá dar de baja ante la repartición que corresponda la actividad; caso contrario se obliga a abonar a la LOCADORA en concepto de cláusula penal una multa diaria equivalente a diez (10) litros de nafta grado 3 (premium) desde el día siguiente de notificada. Queda determinado que, para la colocación de letreros eléctricos luminosos y cualquier tipo de carteles, es necesaria la conformidad escrita de la LOCADORA y contar con la pertinente autorización municipal.</p>

            <p><strong>SEXTA: RESPONSABILIDAD POR INCUMPLIMIENTO.</strong> Son a cargo de la LOCATARIA las responsabilidades por el incumplimiento de las exigencias emanadas de autoridades municipales y/o judiciales, provinciales o nacionales, que deban observarse en razón del uso dado a lo locado, de los bienes de que se sirva la LOCATARIA o del destino dado a los mismos.</p>

            <p><strong>SÉPTIMA: PLAZO DE LA LOCACIÓN.</strong> La presente locación se pacta por el plazo de <strong>{{plazo}}</strong>, contado a partir del <strong>{{fecha_inicio}}</strong>, venciendo en consecuencia el día <strong>{{fecha_fin}}</strong>.</p>

            <p><strong>OCTAVA: RENOVACIÓN.</strong> Dentro de los tres (3) últimos meses de la relación locativa, cualquiera de las partes podrá convocar a la otra, notificándola en forma fehaciente (exclusivamente por carta documento, telegrama colacionado o notificación notarial), a efecto de acordar la renovación del contrato de locación, en un plazo no mayor de quince (15) días corridos.</p>
            
            <p><strong>NOVENA: PACTO DE PREFERENCIA.</strong> Las partes acuerdan, expresamente, un pacto de preferencia a favor de la LOCATARIA. La LOCADORA se obliga a preferir a la LOCATARIA para la conclusión de un contrato de locación posterior a este acto jurídico ante un tercero con las mismas modalidades. El derecho que otorga esta cláusula es personal y no puede cederse ni pasa a los herederos de la LOCATARIA.</p>

            <p><strong>DÉCIMA: RESCISIÓN DEL CONTRATO POR LA LOCATARIA.</strong> La LOCATARIA podrá, en cualquier momento, resolver la contratación abonando el equivalente al diez por ciento (10%) del saldo del canon locativo futuro, calculado desde la fecha de la notificación de la rescisión hasta la fecha de finalización pactada en el contrato. La LOCATARIA deberá pagar la indemnización en el mismo acto en que debe restituir la tenencia del inmueble.</p>

            <p><strong>DÉCIMA PRIMERA: RESCISIÓN DEL CONTRATO POR LA LOCADORA.</strong> La LOCADORA podrá, en cualquier momento, resolver la contratación abonando el equivalente al diez por ciento (10%) del saldo del canon locativo futuro (Art. 1219, inc. d del CCCN). Deberá notificar en forma fehaciente su decisión con una antelación mínima de noventa (90) días.</p>

            <p><strong>DÉCIMA SEGUNDA: VENTA DEL INMUEBLE ALQUILADO.</strong> En caso de transferencia del dominio del inmueble arrendado, acreditado el acto jurídico, la LOCADORA podrá rescindir este contrato abonando el equivalente al diez por ciento (10%) del saldo del canon locativo futuro, con una antelación mínima de treinta (30) días.</p>

            <p><strong>DÉCIMA TERCERA: RESOLUCIÓN POR MUERTE DE CUALQUIERA DE LAS PARTES.</strong> Se acuerda expresamente que, ante el fallecimiento de cualquiera de las partes, la parte sobreviviente podrá rescindir este contrato de locación, comunicando tal decisión a cualquiera de los herederos fehacientemente.</p>

            <p><strong>DÉCIMA CUARTA: CLÁUSULA PENAL.</strong> La LOCATARIA se obliga, a la finalización del contrato por cualquiera de las causas, a restituir la tenencia del inmueble alquilado, conjuntamente con sus accesorios, en el estado de conservación y uso acordado. El incumplimiento hará pasible a la LOCATARIA de pagar una multa diaria al equivalente de diez (10) litros diarios de nafta grado 3 (premium), a elección de la LOCADORA, desde el día en que es exigible la obligación de restituir la tenencia.</p>

            <p><strong>DÉCIMA QUINTA: ABANDONO DE LA LOCACIÓN.</strong> En el caso de que la LOCATARIA abandone el inmueble alquilado, la parte LOCADORA podrá ejercer el derecho a recuperar la tenencia del mismo, en los términos del artículo 238 del Código Procesal Civil, Comercial y Tributario de la Provincia de Mendoza (CPCT).</p>

            <p><strong>DÉCIMA SEXTA: PRECIO DEL ALQUILER E ÍNDICE APLICABLE.</strong> Las partes fijan de común acuerdo por esta locación el pago de un canon inicial mensual de <strong>{{monto}}</strong>. El precio se reajustará en forma <strong>{{frecuencia_ajuste}}</strong> y acumulativa, conforme al índice <strong>{{indice_ajuste}}</strong>. El canon mensual de alquiler será abonado por anticipado el día primero (1) de cada mes en el domicilio fijado por la LOCADORA. El precio del alquiler se pacta por períodos de mes entero. Solo se admitirá como único medio de prueba de pago el recibo.</p>

            <p><strong>DÉCIMA SÉPTIMA: AUTORIZACIÓN.</strong> La LOCADORA autoriza al Corredor Público Inmobiliario SRA. LAURA ALICIA GONZALEZ, matrícula Nº 1572, y a quienes este designe, para que cobre el precio de los alquileres, practique intimaciones, realice inspecciones y reciba la tenencia y llaves del inmueble arrendado.</p>

            <p><strong>DÉCIMA OCTAVA: CONSIGNACIÓN DE LLAVES.</strong> En caso de consignación de llaves, el canon mensual regirá hasta que la LOCADORA reciba la real y efectiva tenencia del inmueble locado a través del Oficial de Justicia actuante.</p>

            <p><strong>DÉCIMA NOVENA: SERVICIOS Y TASAS.</strong> Durante la vigencia del contrato, la LOCATARIA se obliga a pagar: Energía Eléctrica ({{servicios_edemsa}}), Gas Natural ({{servicios_ecogas}}), Agua y cloacas ({{servicios_aysam}}), Expensas (si correspondieren), y Tasas/Impuestos Municipales ({{servicios_muni}}), además de las multas que impongan organismos estatales. Los servicios se suman e integran el precio del alquiler. La LOCADORA podrá negarse a recibir del LOCATARIO todo pago que no comprenda los servicios y comprobantes originales correspondientes.</p>

            <p><strong>VIGÉSIMA: CLÁUSULA PENAL POR MORA EN EL PAGO.</strong> Al incurrir en mora en el pago de los cánones mensuales y servicios, la LOCATARIA se obliga a abonar a la LOCADORA en concepto de cláusula penal una multa del UNO O UNO Y MEDIO POR CIENTO diaria. Al locatario se le concede un plazo de gracia (del 1 al 8 o 10 del mes según pacto explícito); vencido el plazo, la multa se calculará desde el día primero (1) del mes en que incurrió en mora.</p>

            <p><strong>VIGÉSIMA PRIMERA: ESTADO DEL INMUEBLE.</strong> 
            {{#if es_renovacion}}
                Las Partes ratifican que el inmueble se encuentra en poder del LOCATARIO en virtud de la continuidad locativa declarada. El LOCATARIO declara conocer perfectamente el estado de conservación y habitabilidad del inmueble, el cual se rige exclusivamente por el estado inicial, obligándose a restituirlo en idénticas condiciones.
            {{else}}
                El inmueble se entrega a la LOCATARIA en buen estado de conservación y recién pintado en su totalidad. La LOCATARIA al restituir la tenencia se obliga a pagar la mano de obra y materiales necesarios para pintar el inmueble a nuevo en su interior y exterior. Dentro de los 15 días de suscripto el contrato podrá realizar objeciones; vencido el plazo no se admitirán reclamos.
            {{/if}}
            La LOCATARIA se obliga, a su cargo exclusivo, a mantener limpios patios, techos y desagües, y que la instalación de artefactos eléctricos o a gas la realice un profesional idóneo matriculado.
            </p>

            <p><strong>VIGÉSIMA SEGUNDA: SEGURIDAD.</strong> La LOCATARIA se obliga a tomar todas las precauciones de seguridad necesarias para evitar hechos delictivos (cerrar accesos, mantener herrajes y luces). Deberá comunicar cualquier comisión de delito inmediatamente a la Autoridad Pública y a la LOCADORA.</p>

            <p><strong>VIGÉSIMA TERCERA: REPARACIONES.</strong> Todo arreglo de simple mantenimiento queda a cargo y costa exclusiva de la LOCATARIA. Las REPARACIONES URGENTES (filtraciones en techos, cloacas, caños de gas/agua, sistema eléctrico) están a cargo exclusivo de la LOCADORA. Las REPARACIONES NO URGENTES (mantenimiento de calefón, aire acondicionado, cerraduras, llaves de luz) están a cargo de la LOCATARIA, salvo vetustez comprobada. En caso de vandalismo, las roturas (rejas, techos, puertas) deberán ser reparadas por la LOCATARIA a su exclusivo costo.</p>

            <p><strong>VIGÉSIMA CUARTA: INSPECCIÓN INMUEBLE LOCADO.</strong> La LOCADORA o sus representantes tienen derecho a vigilar e inspeccionar el estado del inmueble locado, informando día y hora. El incumplimiento hará pasible a la LOCATARIA de pagar una multa diaria equivalente a diez (10) litros de nafta grado 3 (premium).</p>

            <p><strong>VIGÉSIMA QUINTA: MEJORAS.</strong> Le queda absolutamente prohibido a la LOCATARIA hacer mejoras e innovaciones edilicias. En caso de incumplimiento, la LOCATARIA renuncia al Derecho de Retención y la LOCADORA podrá optar por restituir las cosas a su estado anterior a cargo de la LOCATARIA o dejarlas a beneficio del inmueble sin reembolso.</p>

            <p><strong>VIGÉSIMA SEXTA: CESIÓN, SUBLOCACIÓN Y COMODATO.</strong> La locación asume carácter personal e intransferible. Queda absolutamente prohibida la cesión de la posición contractual y la sublocación total o parcial.</p>

            <p><strong>VIGÉSIMA SÉPTIMA: PROHIBICIÓN DE ELEMENTOS NOCIVOS.</strong> Queda prohibido la introducción de elementos nocivos, peligrosos o que produzcan ruidos molestos que resulten perjudiciales para la unidad o vecinos.</p>

            <p><strong>VIGÉSIMA OCTAVA: PROHIBICIÓN DE ANIMALES.</strong> Queda prohibido a la LOCATARIA la introducción de animales de ningún tipo. En caso de incumplimiento, se obliga a pagar una multa diaria equivalente a diez (10) litros diarios de nafta grado 3 (premium) desde el día siguiente de notificada.</p>

            <p><strong>VIGÉSIMA NOVENA: EXCEPCIÓN Y LIBERACIÓN DE RESPONSABILIDAD.</strong> La LOCADORA no se responsabiliza de accidentes, daños y perjuicios por caso fortuito, fuerza mayor, robo, hurto o incendios. La LOCATARIA libera a la LOCADORA de toda responsabilidad por interrupción de los servicios de gas, luz y agua.</p>

            <p><strong>TRIGÉSIMA: CONSENTIMIENTO.</strong> La LOCATARIA manifiesta expresamente su consentimiento para que la parte LOCADORA transmita a un tercero su posición contractual (Ej: venta de la propiedad).</p>

            <p><strong>TRIGÉSIMA PRIMERA: REGLAMENTO DE COPROPIEDAD Y NORMAS DE CONVIVENCIA.</strong> La LOCATARIA se obliga a cumplir todas las disposiciones del Reglamento de Copropiedad y Normas de Convivencia (ruidos molestos, horarios de siesta), cuyo incumplimiento se constituye en causal de desalojo.</p>

            <p><strong>TRIGÉSIMA SEGUNDA: CASO FORTUITO O FUERZA MAYOR.</strong> Si el inmueble fuere destruido parcial o totalmente por caso fortuito, el contrato queda rescindido sin responsabilidad para las partes.</p>

            <p><strong>TRIGÉSIMA TERCERA: OBLIGACIÓN DE VIGILANCIA.</strong> La LOCATARIA está obligada a poner en conocimiento fehaciente (telegrama, carta documento o notificación notarial) a la LOCADORA de todo hecho dañoso en el término de 24 horas.</p>

            <p><strong>TRIGÉSIMA CUARTA: DEPÓSITO.</strong> La LOCATARIA entrega a la LOCADORA la suma de <strong>{{monto_deposito}}</strong> mediante <strong>{{tipo_deposito}}</strong>. Esta suma no devengará interés y será reintegrada a la LOCATARIA dentro de los 30 días hábiles contados a partir de la fecha de restitución del inmueble, libre de toda deuda.</p>

            <p><strong>TRIGÉSIMA QUINTA: SEGURO.</strong> La LOCATARIA se obliga a contratar con una compañía aseguradora de primera línea, un seguro que cubra el siniestro de incendio por el valor en plaza del inmueble e instalaciones, incluyendo daños a terceros. La póliza deberá tener vigencia por todo el plazo contractual y endosarse a favor de la LOCADORA.</p>

            <p><strong>TRIGÉSIMA SEXTA: CODEUDORES.</strong> Las siguientes personas firman de conformidad y se constituyen en CODEUDORES en forma solidaria, indivisible y como principales pagadores:<br>
            <i>{{codeudores}}</i><br>
            Deberán hacerse cargo solidariamente de los gastos y honorarios extrajudiciales y costas de juicios. En caso de quiebra del locatario, no se suspenden los intereses para los codeudores.
            </p>

            <p><strong>TRIGÉSIMA SÉPTIMA: ASENTIMIENTO.</strong> Los cónyuges y/o parejas integrantes de una unión convivencial de los codeudores, al suscribir el presente, prestan su expreso asentimiento (Arts. 456 y 522 del CCCN).</p>

            <p><strong>TRIGÉSIMA OCTAVA: OBLIGACIONES INDIVISIBLES Y SOLIDARIAS.</strong> Las obligaciones de la LOCATARIA y los CODEUDORES son indivisibles y solidarias. Se facultan recíprocamente para convenir la entrega del inmueble o rescisión.</p>

            <p><strong>TRIGÉSIMA NOVENA: MORA DE PLENO DERECHO.</strong> La falta de pago de un (1) mes de alquiler por adelantado o incumplimiento contractual hará incurrir en mora de pleno derecho, produciendo la rescisión culpable del contrato y habilitando el desalojo.</p>

            <p><strong>CUADRAGÉSIMA: CODEME - VERAZ.</strong> La LOCATARIA y CODEUDORES aceptan expresamente que, ante la falta de pago, la LOCADORA podrá presentarlos como morosos ante el Clearing Mendoza, CODEME, VERAZ, prestando su libre consentimiento (Ley 25.326).</p>

            <p><strong>CUADRAGÉSIMA PRIMERA: HONORARIOS PROFESIONALES.</strong> La LOCATARIA y CODEUDORES tendrán a su cargo exclusivo el pago de los honorarios profesionales y demás gastos originados por incumplimiento contractual.</p>

            <p><strong>CUADRAGÉSIMA SEGUNDA: PROCESO MONITORIO Y EJECUCIÓN.</strong> Las partes convienen que el cobro de toda suma adeudada se tramite según las normas para el proceso de estructura monitoria y ejecución (Arts. 232, 233, 234 CPCT Mendoza).</p>

            <p><strong>CUADRAGÉSIMA TERCERA: REDACCIÓN DEL CONTRATO.</strong> El presente contrato y sus cláusulas han sido instrumentadas conforme a expresas instrucciones de las partes, declarando que conocen y aceptan su totalidad.</p>

            <p><strong>CUADRAGÉSIMA CUARTA: FUERO FEDERAL Y COMPETENCIA.</strong> Las partes renuncian expresamente al fuero federal, sometiéndose exclusivamente a la competencia de los Tribunales de Paz de la Capital de Mendoza, Primera Circunscripción Judicial.</p>
            
            <p><strong>CUADRAGÉSIMA QUINTA: SELLADO E INTERVENCIÓN PROFESIONAL.</strong> El tributo de sellos será solventado por partes iguales. Interviene la Corredora Pública Inmobiliaria SRA. LAURA ALICIA GONZALEZ, Matrícula Nº 1572.</p>

            <p><strong>CUADRAGÉSIMA SEXTA: DOMICILIOS ELECTRÓNICOS Y NOTIFICACIÓN.</strong><br>
            LOCADORA: {{locador_email}} | Tel: {{locador_tel}}<br>
            LOCATARIA: {{locatario_email}} | Tel: {{locatario_tel}}<br>
            Toda notificación remitida a los domicilios electrónicos o reales/especiales denunciados se tendrá por válida y vinculante.
            </p>

            <p><strong>CUADRAGÉSIMA SÉPTIMA: DECLARACIÓN.</strong> Las partes manifiestan su expreso consentimiento y declaran haber leído y comprendido todas las cláusulas.</p>
            
            <p>Prestando conformidad y para constancia se firman dos ejemplares del mismo tenor.</p>
        </div>
    `;

  // Compilamos e inyectamos los datos del formulario
  const template = Handlebars.compile(templateHtml);
  const htmlFinal = template(d);

  res.send(htmlFinal);
});

// Ruta para generar el PDF
router.post("/generar-pdf", async (req, res) => {
  const { htmlEditado, nombreArchivo } = req.body;
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setContent(htmlEditado, { waitUntil: "networkidle0" });

    const directorioResultados = path.join(__dirname, "resultados");
    if (!fs.existsSync(directorioResultados)) {
      fs.mkdirSync(directorioResultados, { recursive: true });
    }

    const pdfPath = path.join(
      directorioResultados,
      `${nombreArchivo || "Contrato"}.pdf`,
    );

    await page.pdf({
      path: pdfPath,
      format: "A4",
      margin: { top: "2.5cm", right: "2cm", bottom: "2.5cm", left: "2cm" },
    });

    await browser.close();
    res.json({
      success: true,
      mensaje: `PDF generado con éxito en: ${pdfPath}`,
    });
  } catch (error) {
    console.error("Error al generar el PDF:", error);
    res.status(500).json({ error: "Hubo un error al generar el documento." });
  }
});

export default router;
