<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Factur-X release metadata
     Version: 1.09.2
     Release date: 2026-08-04
     Effective date: 2026-09-01
-->
<xsl:stylesheet xmlns:svrl="http://purl.oclc.org/dsdl/svrl" xmlns:iso="http://purl.oclc.org/dsdl/schematron" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:saxon="http://saxon.sf.net/" xmlns:schold="http://www.ascc.net/xml/schematron" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="2.0">
<xsl:variable name="__bundled_facturx_codes">
<!-- Factur-X release metadata
     Version: 1.09.2
     Release date: 2026-08-04
     Effective date: 2026-09-01
-->
<codedb>
  <cl id="1">
    <enumeration value="urn:factur-x.eu:1p0:basicwl"/>
    <enumeration value="urn:zugferd.de:2p0:basicwl"/>
  </cl>
  <cl id="2">
    <enumeration value="71"/>
    <enumeration value="80"/>
    <enumeration value="81"/>
    <enumeration value="82"/>
    <enumeration value="83"/>
    <enumeration value="84"/>
    <enumeration value="102"/>
    <enumeration value="130"/>
    <enumeration value="202"/>
    <enumeration value="203"/>
    <enumeration value="204"/>
    <enumeration value="211"/>
    <enumeration value="218"/>
    <enumeration value="219"/>
    <enumeration value="261"/>
    <enumeration value="262"/>
    <enumeration value="295"/>
    <enumeration value="296"/>
    <enumeration value="308"/>
    <enumeration value="325"/>
    <enumeration value="326"/>
    <enumeration value="331"/>
    <enumeration value="380"/>
    <enumeration value="381"/>
    <enumeration value="382"/>
    <enumeration value="383"/>
    <enumeration value="384"/>
    <enumeration value="385"/>
    <enumeration value="386"/>
    <enumeration value="387"/>
    <enumeration value="388"/>
    <enumeration value="389"/>
    <enumeration value="390"/>
    <enumeration value="393"/>
    <enumeration value="394"/>
    <enumeration value="395"/>
    <enumeration value="396"/>
    <enumeration value="420"/>
    <enumeration value="456"/>
    <enumeration value="457"/>
    <enumeration value="458"/>
    <enumeration value="471"/>
    <enumeration value="472"/>
    <enumeration value="473"/>
    <enumeration value="500"/>
    <enumeration value="501"/>
    <enumeration value="502"/>
    <enumeration value="503"/>
    <enumeration value="527"/>
    <enumeration value="532"/>
    <enumeration value="553"/>
    <enumeration value="575"/>
    <enumeration value="623"/>
    <enumeration value="633"/>
    <enumeration value="751"/>
    <enumeration value="780"/>
    <enumeration value="817"/>
    <enumeration value="870"/>
    <enumeration value="875"/>
    <enumeration value="876"/>
    <enumeration value="877"/>
    <enumeration value="935"/>
  </cl>
  <cl id="3">
    <enumeration value="102"/>
  </cl>
  <cl id="4">
    <enumeration value="AAA"/>
    <enumeration value="AAB"/>
    <enumeration value="AAC"/>
    <enumeration value="AAD"/>
    <enumeration value="AAE"/>
    <enumeration value="AAF"/>
    <enumeration value="AAG"/>
    <enumeration value="AAI"/>
    <enumeration value="AAJ"/>
    <enumeration value="AAK"/>
    <enumeration value="AAL"/>
    <enumeration value="AAM"/>
    <enumeration value="AAN"/>
    <enumeration value="AAO"/>
    <enumeration value="AAP"/>
    <enumeration value="AAQ"/>
    <enumeration value="AAR"/>
    <enumeration value="AAS"/>
    <enumeration value="AAT"/>
    <enumeration value="AAU"/>
    <enumeration value="AAV"/>
    <enumeration value="AAW"/>
    <enumeration value="AAX"/>
    <enumeration value="AAY"/>
    <enumeration value="AAZ"/>
    <enumeration value="ABA"/>
    <enumeration value="ABB"/>
    <enumeration value="ABC"/>
    <enumeration value="ABD"/>
    <enumeration value="ABE"/>
    <enumeration value="ABF"/>
    <enumeration value="ABG"/>
    <enumeration value="ABH"/>
    <enumeration value="ABI"/>
    <enumeration value="ABJ"/>
    <enumeration value="ABK"/>
    <enumeration value="ABL"/>
    <enumeration value="ABM"/>
    <enumeration value="ABN"/>
    <enumeration value="ABO"/>
    <enumeration value="ABP"/>
    <enumeration value="ABQ"/>
    <enumeration value="ABR"/>
    <enumeration value="ABS"/>
    <enumeration value="ABT"/>
    <enumeration value="ABU"/>
    <enumeration value="ABV"/>
    <enumeration value="ABW"/>
    <enumeration value="ABX"/>
    <enumeration value="ABZ"/>
    <enumeration value="ACA"/>
    <enumeration value="ACB"/>
    <enumeration value="ACC"/>
    <enumeration value="ACD"/>
    <enumeration value="ACE"/>
    <enumeration value="ACF"/>
    <enumeration value="ACG"/>
    <enumeration value="ACH"/>
    <enumeration value="ACI"/>
    <enumeration value="ACJ"/>
    <enumeration value="ACK"/>
    <enumeration value="ACL"/>
    <enumeration value="ACM"/>
    <enumeration value="ACN"/>
    <enumeration value="ACO"/>
    <enumeration value="ACP"/>
    <enumeration value="ACQ"/>
    <enumeration value="ACR"/>
    <enumeration value="ACS"/>
    <enumeration value="ACT"/>
    <enumeration value="ACU"/>
    <enumeration value="ACV"/>
    <enumeration value="ACW"/>
    <enumeration value="ACX"/>
    <enumeration value="ACY"/>
    <enumeration value="ACZ"/>
    <enumeration value="ADA"/>
    <enumeration value="ADB"/>
    <enumeration value="ADC"/>
    <enumeration value="ADD"/>
    <enumeration value="ADE"/>
    <enumeration value="ADF"/>
    <enumeration value="ADG"/>
    <enumeration value="ADH"/>
    <enumeration value="ADI"/>
    <enumeration value="ADJ"/>
    <enumeration value="ADK"/>
    <enumeration value="ADL"/>
    <enumeration value="ADM"/>
    <enumeration value="ADN"/>
    <enumeration value="ADO"/>
    <enumeration value="ADP"/>
    <enumeration value="ADQ"/>
    <enumeration value="ADR"/>
    <enumeration value="ADS"/>
    <enumeration value="ADT"/>
    <enumeration value="ADU"/>
    <enumeration value="ADV"/>
    <enumeration value="ADW"/>
    <enumeration value="ADX"/>
    <enumeration value="ADY"/>
    <enumeration value="ADZ"/>
    <enumeration value="AEA"/>
    <enumeration value="AEB"/>
    <enumeration value="AEC"/>
    <enumeration value="AED"/>
    <enumeration value="AEE"/>
    <enumeration value="AEF"/>
    <enumeration value="AEG"/>
    <enumeration value="AEH"/>
    <enumeration value="AEI"/>
    <enumeration value="AEJ"/>
    <enumeration value="AEK"/>
    <enumeration value="AEL"/>
    <enumeration value="AEM"/>
    <enumeration value="AEN"/>
    <enumeration value="AEO"/>
    <enumeration value="AEP"/>
    <enumeration value="AEQ"/>
    <enumeration value="AER"/>
    <enumeration value="AES"/>
    <enumeration value="AET"/>
    <enumeration value="AEU"/>
    <enumeration value="AEV"/>
    <enumeration value="AEW"/>
    <enumeration value="AEX"/>
    <enumeration value="AEY"/>
    <enumeration value="AEZ"/>
    <enumeration value="AFA"/>
    <enumeration value="AFB"/>
    <enumeration value="AFC"/>
    <enumeration value="AFD"/>
    <enumeration value="AFE"/>
    <enumeration value="AFF"/>
    <enumeration value="AFG"/>
    <enumeration value="AFH"/>
    <enumeration value="AFI"/>
    <enumeration value="AFJ"/>
    <enumeration value="AFK"/>
    <enumeration value="AFL"/>
    <enumeration value="AFM"/>
    <enumeration value="AFN"/>
    <enumeration value="AFO"/>
    <enumeration value="AFP"/>
    <enumeration value="AFQ"/>
    <enumeration value="AFR"/>
    <enumeration value="AFS"/>
    <enumeration value="AFT"/>
    <enumeration value="AFU"/>
    <enumeration value="AFV"/>
    <enumeration value="AFW"/>
    <enumeration value="AFX"/>
    <enumeration value="AFY"/>
    <enumeration value="AFZ"/>
    <enumeration value="AGA"/>
    <enumeration value="AGB"/>
    <enumeration value="AGC"/>
    <enumeration value="AGD"/>
    <enumeration value="AGE"/>
    <enumeration value="AGF"/>
    <enumeration value="AGG"/>
    <enumeration value="AGH"/>
    <enumeration value="AGI"/>
    <enumeration value="AGJ"/>
    <enumeration value="AGK"/>
    <enumeration value="AGL"/>
    <enumeration value="AGM"/>
    <enumeration value="AGN"/>
    <enumeration value="AGO"/>
    <enumeration value="AGP"/>
    <enumeration value="AGQ"/>
    <enumeration value="AGR"/>
    <enumeration value="AGS"/>
    <enumeration value="AGT"/>
    <enumeration value="AGU"/>
    <enumeration value="AGV"/>
    <enumeration value="AGW"/>
    <enumeration value="AGX"/>
    <enumeration value="AGY"/>
    <enumeration value="AGZ"/>
    <enumeration value="AHA"/>
    <enumeration value="AHB"/>
    <enumeration value="AHC"/>
    <enumeration value="AHD"/>
    <enumeration value="AHE"/>
    <enumeration value="AHF"/>
    <enumeration value="AHG"/>
    <enumeration value="AHH"/>
    <enumeration value="AHI"/>
    <enumeration value="AHJ"/>
    <enumeration value="AHK"/>
    <enumeration value="AHL"/>
    <enumeration value="AHM"/>
    <enumeration value="AHN"/>
    <enumeration value="AHO"/>
    <enumeration value="AHP"/>
    <enumeration value="AHQ"/>
    <enumeration value="AHR"/>
    <enumeration value="AHS"/>
    <enumeration value="AHT"/>
    <enumeration value="AHU"/>
    <enumeration value="AHV"/>
    <enumeration value="AHW"/>
    <enumeration value="AHX"/>
    <enumeration value="AHY"/>
    <enumeration value="AHZ"/>
    <enumeration value="AIA"/>
    <enumeration value="AIB"/>
    <enumeration value="AIC"/>
    <enumeration value="AID"/>
    <enumeration value="AIE"/>
    <enumeration value="AIF"/>
    <enumeration value="AIG"/>
    <enumeration value="AIH"/>
    <enumeration value="AII"/>
    <enumeration value="AIJ"/>
    <enumeration value="AIK"/>
    <enumeration value="AIL"/>
    <enumeration value="AIM"/>
    <enumeration value="AIN"/>
    <enumeration value="AIO"/>
    <enumeration value="AIP"/>
    <enumeration value="AIQ"/>
    <enumeration value="AIR"/>
    <enumeration value="AIS"/>
    <enumeration value="AIT"/>
    <enumeration value="AIU"/>
    <enumeration value="AIV"/>
    <enumeration value="AIW"/>
    <enumeration value="AIX"/>
    <enumeration value="AIY"/>
    <enumeration value="AIZ"/>
    <enumeration value="AJA"/>
    <enumeration value="AJB"/>
    <enumeration value="ALC"/>
    <enumeration value="ALD"/>
    <enumeration value="ALE"/>
    <enumeration value="ALF"/>
    <enumeration value="ALG"/>
    <enumeration value="ALH"/>
    <enumeration value="ALI"/>
    <enumeration value="ALJ"/>
    <enumeration value="ALK"/>
    <enumeration value="ALL"/>
    <enumeration value="ALM"/>
    <enumeration value="ALN"/>
    <enumeration value="ALO"/>
    <enumeration value="ALP"/>
    <enumeration value="ALQ"/>
    <enumeration value="ARR"/>
    <enumeration value="ARS"/>
    <enumeration value="AUT"/>
    <enumeration value="AUU"/>
    <enumeration value="AUV"/>
    <enumeration value="AUW"/>
    <enumeration value="AUX"/>
    <enumeration value="AUY"/>
    <enumeration value="AUZ"/>
    <enumeration value="AVA"/>
    <enumeration value="AVB"/>
    <enumeration value="AVC"/>
    <enumeration value="AVD"/>
    <enumeration value="AVE"/>
    <enumeration value="AVF"/>
    <enumeration value="BAG"/>
    <enumeration value="BAH"/>
    <enumeration value="BAI"/>
    <enumeration value="BAJ"/>
    <enumeration value="BAK"/>
    <enumeration value="BAL"/>
    <enumeration value="BAM"/>
    <enumeration value="BAN"/>
    <enumeration value="BAO"/>
    <enumeration value="BAP"/>
    <enumeration value="BAQ"/>
    <enumeration value="BAR"/>
    <enumeration value="BAS"/>
    <enumeration value="BAT"/>
    <enumeration value="BAU"/>
    <enumeration value="BAV"/>
    <enumeration value="BAW"/>
    <enumeration value="BAX"/>
    <enumeration value="BAY"/>
    <enumeration value="BAZ"/>
    <enumeration value="BBA"/>
    <enumeration value="BBB"/>
    <enumeration value="BLC"/>
    <enumeration value="BLD"/>
    <enumeration value="BLE"/>
    <enumeration value="BLF"/>
    <enumeration value="BLG"/>
    <enumeration value="BLH"/>
    <enumeration value="BLI"/>
    <enumeration value="BLJ"/>
    <enumeration value="BLK"/>
    <enumeration value="BLL"/>
    <enumeration value="BLM"/>
    <enumeration value="BLN"/>
    <enumeration value="BLO"/>
    <enumeration value="BLP"/>
    <enumeration value="BLQ"/>
    <enumeration value="BLR"/>
    <enumeration value="BLS"/>
    <enumeration value="BLT"/>
    <enumeration value="BLU"/>
    <enumeration value="BLV"/>
    <enumeration value="BLW"/>
    <enumeration value="BLX"/>
    <enumeration value="BLY"/>
    <enumeration value="BLZ"/>
    <enumeration value="BMA"/>
    <enumeration value="BMB"/>
    <enumeration value="BMC"/>
    <enumeration value="BMD"/>
    <enumeration value="BME"/>
    <enumeration value="BMF"/>
    <enumeration value="BMG"/>
    <enumeration value="BMH"/>
    <enumeration value="CCI"/>
    <enumeration value="CCJ"/>
    <enumeration value="CCK"/>
    <enumeration value="CCL"/>
    <enumeration value="CCM"/>
    <enumeration value="CCN"/>
    <enumeration value="CCO"/>
    <enumeration value="CEX"/>
    <enumeration value="CHG"/>
    <enumeration value="CIP"/>
    <enumeration value="CLP"/>
    <enumeration value="CLR"/>
    <enumeration value="COI"/>
    <enumeration value="CUR"/>
    <enumeration value="CUS"/>
    <enumeration value="DAR"/>
    <enumeration value="DCL"/>
    <enumeration value="DEL"/>
    <enumeration value="DIN"/>
    <enumeration value="DOC"/>
    <enumeration value="DUT"/>
    <enumeration value="EUR"/>
    <enumeration value="FBC"/>
    <enumeration value="GBL"/>
    <enumeration value="GEN"/>
    <enumeration value="GS7"/>
    <enumeration value="HAN"/>
    <enumeration value="HAZ"/>
    <enumeration value="ICN"/>
    <enumeration value="IIN"/>
    <enumeration value="IMI"/>
    <enumeration value="IND"/>
    <enumeration value="INS"/>
    <enumeration value="INV"/>
    <enumeration value="IRP"/>
    <enumeration value="ITR"/>
    <enumeration value="ITS"/>
    <enumeration value="LAN"/>
    <enumeration value="LIN"/>
    <enumeration value="LOI"/>
    <enumeration value="MCO"/>
    <enumeration value="MDH"/>
    <enumeration value="MKS"/>
    <enumeration value="ORI"/>
    <enumeration value="OSI"/>
    <enumeration value="PAC"/>
    <enumeration value="PAI"/>
    <enumeration value="PAY"/>
    <enumeration value="PKG"/>
    <enumeration value="PKT"/>
    <enumeration value="PMD"/>
    <enumeration value="PMT"/>
    <enumeration value="PRD"/>
    <enumeration value="PRF"/>
    <enumeration value="PRI"/>
    <enumeration value="PUR"/>
    <enumeration value="QIN"/>
    <enumeration value="QQD"/>
    <enumeration value="QUT"/>
    <enumeration value="RAH"/>
    <enumeration value="REG"/>
    <enumeration value="RET"/>
    <enumeration value="REV"/>
    <enumeration value="RQR"/>
    <enumeration value="SAF"/>
    <enumeration value="SIC"/>
    <enumeration value="SIN"/>
    <enumeration value="SLR"/>
    <enumeration value="SPA"/>
    <enumeration value="SPG"/>
    <enumeration value="SPH"/>
    <enumeration value="SPP"/>
    <enumeration value="SPT"/>
    <enumeration value="SRN"/>
    <enumeration value="SSR"/>
    <enumeration value="SUR"/>
    <enumeration value="TCA"/>
    <enumeration value="TDT"/>
    <enumeration value="TRA"/>
    <enumeration value="TRR"/>
    <enumeration value="TXD"/>
    <enumeration value="WHI"/>
    <enumeration value="ZZZ"/>
  </cl>
  <cl id="5">
    <enumeration value="0002"/>
    <enumeration value="0003"/>
    <enumeration value="0004"/>
    <enumeration value="0005"/>
    <enumeration value="0006"/>
    <enumeration value="0007"/>
    <enumeration value="0008"/>
    <enumeration value="0009"/>
    <enumeration value="0010"/>
    <enumeration value="0011"/>
    <enumeration value="0012"/>
    <enumeration value="0013"/>
    <enumeration value="0014"/>
    <enumeration value="0015"/>
    <enumeration value="0016"/>
    <enumeration value="0017"/>
    <enumeration value="0018"/>
    <enumeration value="0019"/>
    <enumeration value="0020"/>
    <enumeration value="0021"/>
    <enumeration value="0022"/>
    <enumeration value="0023"/>
    <enumeration value="0024"/>
    <enumeration value="0025"/>
    <enumeration value="0026"/>
    <enumeration value="0027"/>
    <enumeration value="0028"/>
    <enumeration value="0029"/>
    <enumeration value="0030"/>
    <enumeration value="0031"/>
    <enumeration value="0032"/>
    <enumeration value="0033"/>
    <enumeration value="0034"/>
    <enumeration value="0035"/>
    <enumeration value="0036"/>
    <enumeration value="0037"/>
    <enumeration value="0038"/>
    <enumeration value="0039"/>
    <enumeration value="0040"/>
    <enumeration value="0041"/>
    <enumeration value="0042"/>
    <enumeration value="0043"/>
    <enumeration value="0044"/>
    <enumeration value="0045"/>
    <enumeration value="0046"/>
    <enumeration value="0047"/>
    <enumeration value="0048"/>
    <enumeration value="0049"/>
    <enumeration value="0050"/>
    <enumeration value="0051"/>
    <enumeration value="0052"/>
    <enumeration value="0053"/>
    <enumeration value="0054"/>
    <enumeration value="0055"/>
    <enumeration value="0056"/>
    <enumeration value="0057"/>
    <enumeration value="0058"/>
    <enumeration value="0059"/>
    <enumeration value="0060"/>
    <enumeration value="0061"/>
    <enumeration value="0062"/>
    <enumeration value="0063"/>
    <enumeration value="0064"/>
    <enumeration value="0065"/>
    <enumeration value="0066"/>
    <enumeration value="0067"/>
    <enumeration value="0068"/>
    <enumeration value="0069"/>
    <enumeration value="0070"/>
    <enumeration value="0071"/>
    <enumeration value="0072"/>
    <enumeration value="0073"/>
    <enumeration value="0074"/>
    <enumeration value="0075"/>
    <enumeration value="0076"/>
    <enumeration value="0077"/>
    <enumeration value="0078"/>
    <enumeration value="0079"/>
    <enumeration value="0080"/>
    <enumeration value="0081"/>
    <enumeration value="0082"/>
    <enumeration value="0083"/>
    <enumeration value="0084"/>
    <enumeration value="0085"/>
    <enumeration value="0086"/>
    <enumeration value="0087"/>
    <enumeration value="0088"/>
    <enumeration value="0089"/>
    <enumeration value="0090"/>
    <enumeration value="0091"/>
    <enumeration value="0093"/>
    <enumeration value="0094"/>
    <enumeration value="0095"/>
    <enumeration value="0096"/>
    <enumeration value="0097"/>
    <enumeration value="0098"/>
    <enumeration value="0099"/>
    <enumeration value="0100"/>
    <enumeration value="0101"/>
    <enumeration value="0102"/>
    <enumeration value="0104"/>
    <enumeration value="0105"/>
    <enumeration value="0106"/>
    <enumeration value="0107"/>
    <enumeration value="0108"/>
    <enumeration value="0109"/>
    <enumeration value="0110"/>
    <enumeration value="0111"/>
    <enumeration value="0112"/>
    <enumeration value="0113"/>
    <enumeration value="0114"/>
    <enumeration value="0115"/>
    <enumeration value="0116"/>
    <enumeration value="0117"/>
    <enumeration value="0118"/>
    <enumeration value="0119"/>
    <enumeration value="0120"/>
    <enumeration value="0121"/>
    <enumeration value="0122"/>
    <enumeration value="0123"/>
    <enumeration value="0124"/>
    <enumeration value="0125"/>
    <enumeration value="0126"/>
    <enumeration value="0127"/>
    <enumeration value="0128"/>
    <enumeration value="0129"/>
    <enumeration value="0130"/>
    <enumeration value="0131"/>
    <enumeration value="0132"/>
    <enumeration value="0133"/>
    <enumeration value="0134"/>
    <enumeration value="0135"/>
    <enumeration value="0136"/>
    <enumeration value="0137"/>
    <enumeration value="0138"/>
    <enumeration value="0139"/>
    <enumeration value="0140"/>
    <enumeration value="0141"/>
    <enumeration value="0142"/>
    <enumeration value="0143"/>
    <enumeration value="0144"/>
    <enumeration value="0145"/>
    <enumeration value="0146"/>
    <enumeration value="0147"/>
    <enumeration value="0148"/>
    <enumeration value="0149"/>
    <enumeration value="0150"/>
    <enumeration value="0151"/>
    <enumeration value="0152"/>
    <enumeration value="0153"/>
    <enumeration value="0154"/>
    <enumeration value="0155"/>
    <enumeration value="0156"/>
    <enumeration value="0157"/>
    <enumeration value="0158"/>
    <enumeration value="0159"/>
    <enumeration value="0160"/>
    <enumeration value="0161"/>
    <enumeration value="0162"/>
    <enumeration value="0163"/>
    <enumeration value="0164"/>
    <enumeration value="0165"/>
    <enumeration value="0166"/>
    <enumeration value="0167"/>
    <enumeration value="0168"/>
    <enumeration value="0169"/>
    <enumeration value="0170"/>
    <enumeration value="0171"/>
    <enumeration value="0172"/>
    <enumeration value="0173"/>
    <enumeration value="0174"/>
    <enumeration value="0175"/>
    <enumeration value="0176"/>
    <enumeration value="0177"/>
    <enumeration value="0178"/>
    <enumeration value="0179"/>
    <enumeration value="0180"/>
    <enumeration value="0183"/>
    <enumeration value="0184"/>
    <enumeration value="0185"/>
    <enumeration value="0186"/>
    <enumeration value="0187"/>
    <enumeration value="0188"/>
    <enumeration value="0189"/>
    <enumeration value="0190"/>
    <enumeration value="0191"/>
    <enumeration value="0192"/>
    <enumeration value="0193"/>
    <enumeration value="0194"/>
    <enumeration value="0195"/>
    <enumeration value="0196"/>
    <enumeration value="0197"/>
    <enumeration value="0198"/>
    <enumeration value="0199"/>
    <enumeration value="0200"/>
    <enumeration value="0201"/>
    <enumeration value="0202"/>
    <enumeration value="0203"/>
    <enumeration value="0204"/>
    <enumeration value="0205"/>
    <enumeration value="0206"/>
    <enumeration value="0207"/>
    <enumeration value="0208"/>
    <enumeration value="0209"/>
    <enumeration value="0210"/>
    <enumeration value="0211"/>
    <enumeration value="0212"/>
    <enumeration value="0213"/>
    <enumeration value="0214"/>
    <enumeration value="0215"/>
    <enumeration value="0216"/>
    <enumeration value="0217"/>
    <enumeration value="0218"/>
    <enumeration value="0219"/>
    <enumeration value="0220"/>
    <enumeration value="0221"/>
    <enumeration value="0222"/>
    <enumeration value="0223"/>
    <enumeration value="0224"/>
    <enumeration value="0225"/>
    <enumeration value="0226"/>
    <enumeration value="0227"/>
    <enumeration value="0228"/>
    <enumeration value="0229"/>
    <enumeration value="0230"/>
    <enumeration value="0231"/>
    <enumeration value="0232"/>
    <enumeration value="0233"/>
    <enumeration value="0234"/>
    <enumeration value="0235"/>
    <enumeration value="0236"/>
    <enumeration value="0237"/>
    <enumeration value="0238"/>
    <enumeration value="0239"/>
    <enumeration value="0240"/>
  </cl>
  <cl id="6">
    <enumeration value="0002"/>
    <enumeration value="0003"/>
    <enumeration value="0004"/>
    <enumeration value="0005"/>
    <enumeration value="0006"/>
    <enumeration value="0007"/>
    <enumeration value="0008"/>
    <enumeration value="0009"/>
    <enumeration value="0010"/>
    <enumeration value="0011"/>
    <enumeration value="0012"/>
    <enumeration value="0013"/>
    <enumeration value="0014"/>
    <enumeration value="0015"/>
    <enumeration value="0016"/>
    <enumeration value="0017"/>
    <enumeration value="0018"/>
    <enumeration value="0019"/>
    <enumeration value="0020"/>
    <enumeration value="0021"/>
    <enumeration value="0022"/>
    <enumeration value="0023"/>
    <enumeration value="0024"/>
    <enumeration value="0025"/>
    <enumeration value="0026"/>
    <enumeration value="0027"/>
    <enumeration value="0028"/>
    <enumeration value="0029"/>
    <enumeration value="0030"/>
    <enumeration value="0031"/>
    <enumeration value="0032"/>
    <enumeration value="0033"/>
    <enumeration value="0034"/>
    <enumeration value="0035"/>
    <enumeration value="0036"/>
    <enumeration value="0037"/>
    <enumeration value="0038"/>
    <enumeration value="0039"/>
    <enumeration value="0040"/>
    <enumeration value="0041"/>
    <enumeration value="0042"/>
    <enumeration value="0043"/>
    <enumeration value="0044"/>
    <enumeration value="0045"/>
    <enumeration value="0046"/>
    <enumeration value="0047"/>
    <enumeration value="0048"/>
    <enumeration value="0049"/>
    <enumeration value="0050"/>
    <enumeration value="0051"/>
    <enumeration value="0052"/>
    <enumeration value="0053"/>
    <enumeration value="0054"/>
    <enumeration value="0055"/>
    <enumeration value="0056"/>
    <enumeration value="0057"/>
    <enumeration value="0058"/>
    <enumeration value="0059"/>
    <enumeration value="0060"/>
    <enumeration value="0061"/>
    <enumeration value="0062"/>
    <enumeration value="0063"/>
    <enumeration value="0064"/>
    <enumeration value="0065"/>
    <enumeration value="0066"/>
    <enumeration value="0067"/>
    <enumeration value="0068"/>
    <enumeration value="0069"/>
    <enumeration value="0070"/>
    <enumeration value="0071"/>
    <enumeration value="0072"/>
    <enumeration value="0073"/>
    <enumeration value="0074"/>
    <enumeration value="0075"/>
    <enumeration value="0076"/>
    <enumeration value="0077"/>
    <enumeration value="0078"/>
    <enumeration value="0079"/>
    <enumeration value="0080"/>
    <enumeration value="0081"/>
    <enumeration value="0082"/>
    <enumeration value="0083"/>
    <enumeration value="0084"/>
    <enumeration value="0085"/>
    <enumeration value="0086"/>
    <enumeration value="0087"/>
    <enumeration value="0088"/>
    <enumeration value="0089"/>
    <enumeration value="0090"/>
    <enumeration value="0091"/>
    <enumeration value="0093"/>
    <enumeration value="0094"/>
    <enumeration value="0095"/>
    <enumeration value="0096"/>
    <enumeration value="0097"/>
    <enumeration value="0098"/>
    <enumeration value="0099"/>
    <enumeration value="0100"/>
    <enumeration value="0101"/>
    <enumeration value="0102"/>
    <enumeration value="0104"/>
    <enumeration value="0105"/>
    <enumeration value="0106"/>
    <enumeration value="0107"/>
    <enumeration value="0108"/>
    <enumeration value="0109"/>
    <enumeration value="0110"/>
    <enumeration value="0111"/>
    <enumeration value="0112"/>
    <enumeration value="0113"/>
    <enumeration value="0114"/>
    <enumeration value="0115"/>
    <enumeration value="0116"/>
    <enumeration value="0117"/>
    <enumeration value="0118"/>
    <enumeration value="0119"/>
    <enumeration value="0120"/>
    <enumeration value="0121"/>
    <enumeration value="0122"/>
    <enumeration value="0123"/>
    <enumeration value="0124"/>
    <enumeration value="0125"/>
    <enumeration value="0126"/>
    <enumeration value="0127"/>
    <enumeration value="0128"/>
    <enumeration value="0129"/>
    <enumeration value="0130"/>
    <enumeration value="0131"/>
    <enumeration value="0132"/>
    <enumeration value="0133"/>
    <enumeration value="0134"/>
    <enumeration value="0135"/>
    <enumeration value="0136"/>
    <enumeration value="0137"/>
    <enumeration value="0138"/>
    <enumeration value="0139"/>
    <enumeration value="0140"/>
    <enumeration value="0141"/>
    <enumeration value="0142"/>
    <enumeration value="0143"/>
    <enumeration value="0144"/>
    <enumeration value="0145"/>
    <enumeration value="0146"/>
    <enumeration value="0147"/>
    <enumeration value="0148"/>
    <enumeration value="0149"/>
    <enumeration value="0150"/>
    <enumeration value="0151"/>
    <enumeration value="0152"/>
    <enumeration value="0153"/>
    <enumeration value="0154"/>
    <enumeration value="0155"/>
    <enumeration value="0156"/>
    <enumeration value="0157"/>
    <enumeration value="0158"/>
    <enumeration value="0159"/>
    <enumeration value="0160"/>
    <enumeration value="0161"/>
    <enumeration value="0162"/>
    <enumeration value="0163"/>
    <enumeration value="0164"/>
    <enumeration value="0165"/>
    <enumeration value="0166"/>
    <enumeration value="0167"/>
    <enumeration value="0168"/>
    <enumeration value="0169"/>
    <enumeration value="0170"/>
    <enumeration value="0171"/>
    <enumeration value="0172"/>
    <enumeration value="0173"/>
    <enumeration value="0174"/>
    <enumeration value="0175"/>
    <enumeration value="0176"/>
    <enumeration value="0177"/>
    <enumeration value="0178"/>
    <enumeration value="0179"/>
    <enumeration value="0180"/>
    <enumeration value="0183"/>
    <enumeration value="0184"/>
    <enumeration value="0185"/>
    <enumeration value="0186"/>
    <enumeration value="0187"/>
    <enumeration value="0188"/>
    <enumeration value="0189"/>
    <enumeration value="0190"/>
    <enumeration value="0191"/>
    <enumeration value="0192"/>
    <enumeration value="0193"/>
    <enumeration value="0194"/>
    <enumeration value="0195"/>
    <enumeration value="0196"/>
    <enumeration value="0197"/>
    <enumeration value="0198"/>
    <enumeration value="0199"/>
    <enumeration value="0200"/>
    <enumeration value="0201"/>
    <enumeration value="0202"/>
    <enumeration value="0203"/>
    <enumeration value="0204"/>
    <enumeration value="0205"/>
    <enumeration value="0206"/>
    <enumeration value="0207"/>
    <enumeration value="0208"/>
    <enumeration value="0209"/>
    <enumeration value="0210"/>
    <enumeration value="0211"/>
    <enumeration value="0212"/>
    <enumeration value="0213"/>
    <enumeration value="0214"/>
    <enumeration value="0215"/>
    <enumeration value="0216"/>
    <enumeration value="0217"/>
    <enumeration value="0218"/>
    <enumeration value="0219"/>
    <enumeration value="0220"/>
    <enumeration value="0221"/>
    <enumeration value="0222"/>
    <enumeration value="0223"/>
    <enumeration value="0224"/>
    <enumeration value="0225"/>
    <enumeration value="0226"/>
    <enumeration value="0227"/>
    <enumeration value="0228"/>
    <enumeration value="0229"/>
    <enumeration value="0230"/>
    <enumeration value="0231"/>
    <enumeration value="0232"/>
    <enumeration value="0233"/>
    <enumeration value="0234"/>
    <enumeration value="0235"/>
    <enumeration value="0236"/>
    <enumeration value="0237"/>
    <enumeration value="0238"/>
    <enumeration value="0239"/>
    <enumeration value="0240"/>
    <enumeration value="0241"/>
    <enumeration value="0242"/>
    <enumeration value="0243"/>
    <enumeration value="0244"/>
    <enumeration value="0245"/>
    <enumeration value="0246"/>
    <enumeration value="0247"/>
    <enumeration value="0248"/>
  </cl>
  <cl id="7">
    <enumeration value="1A"/>
    <enumeration value="AD"/>
    <enumeration value="AE"/>
    <enumeration value="AF"/>
    <enumeration value="AG"/>
    <enumeration value="AI"/>
    <enumeration value="AL"/>
    <enumeration value="AM"/>
    <enumeration value="AO"/>
    <enumeration value="AQ"/>
    <enumeration value="AR"/>
    <enumeration value="AS"/>
    <enumeration value="AT"/>
    <enumeration value="AU"/>
    <enumeration value="AW"/>
    <enumeration value="AX"/>
    <enumeration value="AZ"/>
    <enumeration value="BA"/>
    <enumeration value="BB"/>
    <enumeration value="BD"/>
    <enumeration value="BE"/>
    <enumeration value="BF"/>
    <enumeration value="BG"/>
    <enumeration value="BH"/>
    <enumeration value="BI"/>
    <enumeration value="BJ"/>
    <enumeration value="BL"/>
    <enumeration value="BM"/>
    <enumeration value="BN"/>
    <enumeration value="BO"/>
    <enumeration value="BQ"/>
    <enumeration value="BR"/>
    <enumeration value="BS"/>
    <enumeration value="BT"/>
    <enumeration value="BV"/>
    <enumeration value="BW"/>
    <enumeration value="BY"/>
    <enumeration value="BZ"/>
    <enumeration value="CA"/>
    <enumeration value="CC"/>
    <enumeration value="CD"/>
    <enumeration value="CF"/>
    <enumeration value="CG"/>
    <enumeration value="CH"/>
    <enumeration value="CI"/>
    <enumeration value="CK"/>
    <enumeration value="CL"/>
    <enumeration value="CM"/>
    <enumeration value="CN"/>
    <enumeration value="CO"/>
    <enumeration value="CR"/>
    <enumeration value="CU"/>
    <enumeration value="CV"/>
    <enumeration value="CW"/>
    <enumeration value="CX"/>
    <enumeration value="CY"/>
    <enumeration value="CZ"/>
    <enumeration value="DE"/>
    <enumeration value="DJ"/>
    <enumeration value="DK"/>
    <enumeration value="DM"/>
    <enumeration value="DO"/>
    <enumeration value="DZ"/>
    <enumeration value="EC"/>
    <enumeration value="EE"/>
    <enumeration value="EG"/>
    <enumeration value="EH"/>
    <enumeration value="ER"/>
    <enumeration value="ES"/>
    <enumeration value="ET"/>
    <enumeration value="FI"/>
    <enumeration value="FJ"/>
    <enumeration value="FK"/>
    <enumeration value="FM"/>
    <enumeration value="FO"/>
    <enumeration value="FR"/>
    <enumeration value="GA"/>
    <enumeration value="GB"/>
    <enumeration value="GD"/>
    <enumeration value="GE"/>
    <enumeration value="GF"/>
    <enumeration value="GG"/>
    <enumeration value="GH"/>
    <enumeration value="GI"/>
    <enumeration value="GL"/>
    <enumeration value="GM"/>
    <enumeration value="GN"/>
    <enumeration value="GP"/>
    <enumeration value="GQ"/>
    <enumeration value="GR"/>
    <enumeration value="GS"/>
    <enumeration value="GT"/>
    <enumeration value="GU"/>
    <enumeration value="GW"/>
    <enumeration value="GY"/>
    <enumeration value="HK"/>
    <enumeration value="HM"/>
    <enumeration value="HN"/>
    <enumeration value="HR"/>
    <enumeration value="HT"/>
    <enumeration value="HU"/>
    <enumeration value="ID"/>
    <enumeration value="IE"/>
    <enumeration value="IL"/>
    <enumeration value="IM"/>
    <enumeration value="IN"/>
    <enumeration value="IO"/>
    <enumeration value="IQ"/>
    <enumeration value="IR"/>
    <enumeration value="IS"/>
    <enumeration value="IT"/>
    <enumeration value="JE"/>
    <enumeration value="JM"/>
    <enumeration value="JO"/>
    <enumeration value="JP"/>
    <enumeration value="KE"/>
    <enumeration value="KG"/>
    <enumeration value="KH"/>
    <enumeration value="KI"/>
    <enumeration value="KM"/>
    <enumeration value="KN"/>
    <enumeration value="KP"/>
    <enumeration value="KR"/>
    <enumeration value="KW"/>
    <enumeration value="KY"/>
    <enumeration value="KZ"/>
    <enumeration value="LA"/>
    <enumeration value="LB"/>
    <enumeration value="LC"/>
    <enumeration value="LI"/>
    <enumeration value="LK"/>
    <enumeration value="LR"/>
    <enumeration value="LS"/>
    <enumeration value="LT"/>
    <enumeration value="LU"/>
    <enumeration value="LV"/>
    <enumeration value="LY"/>
    <enumeration value="MA"/>
    <enumeration value="MC"/>
    <enumeration value="MD"/>
    <enumeration value="ME"/>
    <enumeration value="MF"/>
    <enumeration value="MG"/>
    <enumeration value="MH"/>
    <enumeration value="MK"/>
    <enumeration value="ML"/>
    <enumeration value="MM"/>
    <enumeration value="MN"/>
    <enumeration value="MO"/>
    <enumeration value="MP"/>
    <enumeration value="MQ"/>
    <enumeration value="MR"/>
    <enumeration value="MS"/>
    <enumeration value="MT"/>
    <enumeration value="MU"/>
    <enumeration value="MV"/>
    <enumeration value="MW"/>
    <enumeration value="MX"/>
    <enumeration value="MY"/>
    <enumeration value="MZ"/>
    <enumeration value="NA"/>
    <enumeration value="NC"/>
    <enumeration value="NE"/>
    <enumeration value="NF"/>
    <enumeration value="NG"/>
    <enumeration value="NI"/>
    <enumeration value="NL"/>
    <enumeration value="NO"/>
    <enumeration value="NP"/>
    <enumeration value="NR"/>
    <enumeration value="NU"/>
    <enumeration value="NZ"/>
    <enumeration value="OM"/>
    <enumeration value="PA"/>
    <enumeration value="PE"/>
    <enumeration value="PF"/>
    <enumeration value="PG"/>
    <enumeration value="PH"/>
    <enumeration value="PK"/>
    <enumeration value="PL"/>
    <enumeration value="PM"/>
    <enumeration value="PN"/>
    <enumeration value="PR"/>
    <enumeration value="PS"/>
    <enumeration value="PT"/>
    <enumeration value="PW"/>
    <enumeration value="PY"/>
    <enumeration value="QA"/>
    <enumeration value="RE"/>
    <enumeration value="RO"/>
    <enumeration value="RS"/>
    <enumeration value="RU"/>
    <enumeration value="RW"/>
    <enumeration value="SA"/>
    <enumeration value="SB"/>
    <enumeration value="SC"/>
    <enumeration value="SD"/>
    <enumeration value="SE"/>
    <enumeration value="SG"/>
    <enumeration value="SH"/>
    <enumeration value="SI"/>
    <enumeration value="SJ"/>
    <enumeration value="SK"/>
    <enumeration value="SL"/>
    <enumeration value="SM"/>
    <enumeration value="SN"/>
    <enumeration value="SO"/>
    <enumeration value="SR"/>
    <enumeration value="SS"/>
    <enumeration value="ST"/>
    <enumeration value="SV"/>
    <enumeration value="SX"/>
    <enumeration value="SY"/>
    <enumeration value="SZ"/>
    <enumeration value="TC"/>
    <enumeration value="TD"/>
    <enumeration value="TF"/>
    <enumeration value="TG"/>
    <enumeration value="TH"/>
    <enumeration value="TJ"/>
    <enumeration value="TK"/>
    <enumeration value="TL"/>
    <enumeration value="TM"/>
    <enumeration value="TN"/>
    <enumeration value="TO"/>
    <enumeration value="TR"/>
    <enumeration value="TT"/>
    <enumeration value="TV"/>
    <enumeration value="TW"/>
    <enumeration value="TZ"/>
    <enumeration value="UA"/>
    <enumeration value="UG"/>
    <enumeration value="UM"/>
    <enumeration value="US"/>
    <enumeration value="UY"/>
    <enumeration value="UZ"/>
    <enumeration value="VA"/>
    <enumeration value="VC"/>
    <enumeration value="VE"/>
    <enumeration value="VG"/>
    <enumeration value="VI"/>
    <enumeration value="VN"/>
    <enumeration value="VU"/>
    <enumeration value="WF"/>
    <enumeration value="WS"/>
    <enumeration value="XI"/>
    <enumeration value="YE"/>
    <enumeration value="YT"/>
    <enumeration value="ZA"/>
    <enumeration value="ZM"/>
    <enumeration value="ZW"/>
    <enumeration value="1A"/>
    <enumeration value="XI"/>
  </cl>
  <cl id="8">
    <enumeration value="0002"/>
    <enumeration value="0007"/>
    <enumeration value="0009"/>
    <enumeration value="0037"/>
    <enumeration value="0060"/>
    <enumeration value="0088"/>
    <enumeration value="0096"/>
    <enumeration value="0097"/>
    <enumeration value="0106"/>
    <enumeration value="0130"/>
    <enumeration value="0135"/>
    <enumeration value="0142"/>
    <enumeration value="0147"/>
    <enumeration value="0151"/>
    <enumeration value="0154"/>
    <enumeration value="0158"/>
    <enumeration value="0170"/>
    <enumeration value="0177"/>
    <enumeration value="0183"/>
    <enumeration value="0184"/>
    <enumeration value="0188"/>
    <enumeration value="0190"/>
    <enumeration value="0191"/>
    <enumeration value="0192"/>
    <enumeration value="0193"/>
    <enumeration value="0194"/>
    <enumeration value="0195"/>
    <enumeration value="0196"/>
    <enumeration value="0198"/>
    <enumeration value="0199"/>
    <enumeration value="0200"/>
    <enumeration value="0201"/>
    <enumeration value="0202"/>
    <enumeration value="0203"/>
    <enumeration value="0204"/>
    <enumeration value="0205"/>
    <enumeration value="0208"/>
    <enumeration value="0209"/>
    <enumeration value="0210"/>
    <enumeration value="0211"/>
    <enumeration value="0212"/>
    <enumeration value="0213"/>
    <enumeration value="0215"/>
    <enumeration value="0216"/>
    <enumeration value="0217"/>
    <enumeration value="0218"/>
    <enumeration value="0221"/>
    <enumeration value="0225"/>
    <enumeration value="0230"/>
    <enumeration value="0235"/>
    <enumeration value="0240"/>
    <enumeration value="0242"/>
    <enumeration value="0244"/>
    <enumeration value="0245"/>
    <enumeration value="0246"/>
    <enumeration value="0248"/>
    <enumeration value="9910"/>
    <enumeration value="9913"/>
    <enumeration value="9914"/>
    <enumeration value="9915"/>
    <enumeration value="9918"/>
    <enumeration value="9919"/>
    <enumeration value="9920"/>
    <enumeration value="9922"/>
    <enumeration value="9923"/>
    <enumeration value="9924"/>
    <enumeration value="9925"/>
    <enumeration value="9926"/>
    <enumeration value="9927"/>
    <enumeration value="9928"/>
    <enumeration value="9929"/>
    <enumeration value="9930"/>
    <enumeration value="9931"/>
    <enumeration value="9932"/>
    <enumeration value="9933"/>
    <enumeration value="9934"/>
    <enumeration value="9935"/>
    <enumeration value="9936"/>
    <enumeration value="9937"/>
    <enumeration value="9938"/>
    <enumeration value="9939"/>
    <enumeration value="9940"/>
    <enumeration value="9941"/>
    <enumeration value="9942"/>
    <enumeration value="9943"/>
    <enumeration value="9944"/>
    <enumeration value="9945"/>
    <enumeration value="9946"/>
    <enumeration value="9947"/>
    <enumeration value="9948"/>
    <enumeration value="9949"/>
    <enumeration value="9950"/>
    <enumeration value="9951"/>
    <enumeration value="9952"/>
    <enumeration value="9953"/>
    <enumeration value="9957"/>
    <enumeration value="9959"/>
    <enumeration value="AN"/>
    <enumeration value="AQ"/>
    <enumeration value="AS"/>
    <enumeration value="AU"/>
    <enumeration value="EM"/>
  </cl>
  <cl id="9">
    <enumeration value="VA"/>
  </cl>
  <cl id="10">
    <enumeration value="VA"/>
  </cl>
  <cl id="11">
    <enumeration value="AED"/>
    <enumeration value="AFN"/>
    <enumeration value="ALL"/>
    <enumeration value="AMD"/>
    <enumeration value="AOA"/>
    <enumeration value="ARS"/>
    <enumeration value="AUD"/>
    <enumeration value="AWG"/>
    <enumeration value="AZN"/>
    <enumeration value="BAM"/>
    <enumeration value="BBD"/>
    <enumeration value="BDT"/>
    <enumeration value="BHD"/>
    <enumeration value="BIF"/>
    <enumeration value="BMD"/>
    <enumeration value="BND"/>
    <enumeration value="BOB"/>
    <enumeration value="BOV"/>
    <enumeration value="BRL"/>
    <enumeration value="BSD"/>
    <enumeration value="BTN"/>
    <enumeration value="BWP"/>
    <enumeration value="BYN"/>
    <enumeration value="BZD"/>
    <enumeration value="CAD"/>
    <enumeration value="CDF"/>
    <enumeration value="CHE"/>
    <enumeration value="CHF"/>
    <enumeration value="CHW"/>
    <enumeration value="CLF"/>
    <enumeration value="CLP"/>
    <enumeration value="CNH"/>
    <enumeration value="CNY"/>
    <enumeration value="COP"/>
    <enumeration value="COU"/>
    <enumeration value="CRC"/>
    <enumeration value="CUP"/>
    <enumeration value="CVE"/>
    <enumeration value="CZK"/>
    <enumeration value="DJF"/>
    <enumeration value="DKK"/>
    <enumeration value="DOP"/>
    <enumeration value="DZD"/>
    <enumeration value="EGP"/>
    <enumeration value="ERN"/>
    <enumeration value="ETB"/>
    <enumeration value="EUR"/>
    <enumeration value="FJD"/>
    <enumeration value="FKP"/>
    <enumeration value="GBP"/>
    <enumeration value="GEL"/>
    <enumeration value="GHS"/>
    <enumeration value="GIP"/>
    <enumeration value="GMD"/>
    <enumeration value="GNF"/>
    <enumeration value="GTQ"/>
    <enumeration value="GYD"/>
    <enumeration value="HKD"/>
    <enumeration value="HNL"/>
    <enumeration value="HTG"/>
    <enumeration value="HUF"/>
    <enumeration value="IDR"/>
    <enumeration value="ILS"/>
    <enumeration value="INR"/>
    <enumeration value="IQD"/>
    <enumeration value="IRR"/>
    <enumeration value="ISK"/>
    <enumeration value="JMD"/>
    <enumeration value="JOD"/>
    <enumeration value="JPY"/>
    <enumeration value="KES"/>
    <enumeration value="KGS"/>
    <enumeration value="KHR"/>
    <enumeration value="KMF"/>
    <enumeration value="KPW"/>
    <enumeration value="KRW"/>
    <enumeration value="KWD"/>
    <enumeration value="KYD"/>
    <enumeration value="KZT"/>
    <enumeration value="LAK"/>
    <enumeration value="LBP"/>
    <enumeration value="LKR"/>
    <enumeration value="LRD"/>
    <enumeration value="LSL"/>
    <enumeration value="LYD"/>
    <enumeration value="MAD"/>
    <enumeration value="MDL"/>
    <enumeration value="MGA"/>
    <enumeration value="MKD"/>
    <enumeration value="MMK"/>
    <enumeration value="MNT"/>
    <enumeration value="MOP"/>
    <enumeration value="MRU"/>
    <enumeration value="MUR"/>
    <enumeration value="MVR"/>
    <enumeration value="MWK"/>
    <enumeration value="MXN"/>
    <enumeration value="MXV"/>
    <enumeration value="MYR"/>
    <enumeration value="MZN"/>
    <enumeration value="NAD"/>
    <enumeration value="NGN"/>
    <enumeration value="NIO"/>
    <enumeration value="NOK"/>
    <enumeration value="NPR"/>
    <enumeration value="NZD"/>
    <enumeration value="OMR"/>
    <enumeration value="PAB"/>
    <enumeration value="PEN"/>
    <enumeration value="PGK"/>
    <enumeration value="PHP"/>
    <enumeration value="PKR"/>
    <enumeration value="PLN"/>
    <enumeration value="PYG"/>
    <enumeration value="QAR"/>
    <enumeration value="RON"/>
    <enumeration value="RSD"/>
    <enumeration value="RUB"/>
    <enumeration value="RWF"/>
    <enumeration value="SAR"/>
    <enumeration value="SBD"/>
    <enumeration value="SCR"/>
    <enumeration value="SDG"/>
    <enumeration value="SEK"/>
    <enumeration value="SGD"/>
    <enumeration value="SHP"/>
    <enumeration value="SLE"/>
    <enumeration value="SOS"/>
    <enumeration value="SRD"/>
    <enumeration value="SSP"/>
    <enumeration value="STN"/>
    <enumeration value="SVC"/>
    <enumeration value="SYP"/>
    <enumeration value="SZL"/>
    <enumeration value="THB"/>
    <enumeration value="TJS"/>
    <enumeration value="TMT"/>
    <enumeration value="TND"/>
    <enumeration value="TOP"/>
    <enumeration value="TRY"/>
    <enumeration value="TTD"/>
    <enumeration value="TWD"/>
    <enumeration value="TZS"/>
    <enumeration value="UAH"/>
    <enumeration value="UGX"/>
    <enumeration value="USD"/>
    <enumeration value="USN"/>
    <enumeration value="UYI"/>
    <enumeration value="UYU"/>
    <enumeration value="UYW"/>
    <enumeration value="UZS"/>
    <enumeration value="VED"/>
    <enumeration value="VES"/>
    <enumeration value="VND"/>
    <enumeration value="VUV"/>
    <enumeration value="WST"/>
    <enumeration value="XAF"/>
    <enumeration value="XAG"/>
    <enumeration value="XAU"/>
    <enumeration value="XBA"/>
    <enumeration value="XBB"/>
    <enumeration value="XBC"/>
    <enumeration value="XBD"/>
    <enumeration value="XCD"/>
    <enumeration value="XCG"/>
    <enumeration value="XDR"/>
    <enumeration value="XOF"/>
    <enumeration value="XPD"/>
    <enumeration value="XPF"/>
    <enumeration value="XPT"/>
    <enumeration value="XSU"/>
    <enumeration value="XTS"/>
    <enumeration value="XUA"/>
    <enumeration value="XXX"/>
    <enumeration value="YER"/>
    <enumeration value="ZAR"/>
    <enumeration value="ZMW"/>
    <enumeration value="ZWG"/>
  </cl>
  <cl id="12">
    <enumeration value="1"/>
    <enumeration value="2"/>
    <enumeration value="3"/>
    <enumeration value="4"/>
    <enumeration value="5"/>
    <enumeration value="6"/>
    <enumeration value="7"/>
    <enumeration value="8"/>
    <enumeration value="9"/>
    <enumeration value="10"/>
    <enumeration value="11"/>
    <enumeration value="12"/>
    <enumeration value="13"/>
    <enumeration value="14"/>
    <enumeration value="15"/>
    <enumeration value="16"/>
    <enumeration value="17"/>
    <enumeration value="18"/>
    <enumeration value="19"/>
    <enumeration value="20"/>
    <enumeration value="21"/>
    <enumeration value="22"/>
    <enumeration value="23"/>
    <enumeration value="24"/>
    <enumeration value="25"/>
    <enumeration value="26"/>
    <enumeration value="27"/>
    <enumeration value="28"/>
    <enumeration value="29"/>
    <enumeration value="30"/>
    <enumeration value="31"/>
    <enumeration value="32"/>
    <enumeration value="33"/>
    <enumeration value="34"/>
    <enumeration value="35"/>
    <enumeration value="36"/>
    <enumeration value="37"/>
    <enumeration value="38"/>
    <enumeration value="39"/>
    <enumeration value="40"/>
    <enumeration value="41"/>
    <enumeration value="42"/>
    <enumeration value="43"/>
    <enumeration value="44"/>
    <enumeration value="45"/>
    <enumeration value="46"/>
    <enumeration value="47"/>
    <enumeration value="48"/>
    <enumeration value="49"/>
    <enumeration value="50"/>
    <enumeration value="51"/>
    <enumeration value="52"/>
    <enumeration value="53"/>
    <enumeration value="54"/>
    <enumeration value="55"/>
    <enumeration value="56"/>
    <enumeration value="57"/>
    <enumeration value="58"/>
    <enumeration value="59"/>
    <enumeration value="60"/>
    <enumeration value="61"/>
    <enumeration value="62"/>
    <enumeration value="63"/>
    <enumeration value="64"/>
    <enumeration value="65"/>
    <enumeration value="66"/>
    <enumeration value="67"/>
    <enumeration value="68"/>
    <enumeration value="69"/>
    <enumeration value="70"/>
    <enumeration value="74"/>
    <enumeration value="75"/>
    <enumeration value="76"/>
    <enumeration value="77"/>
    <enumeration value="78"/>
    <enumeration value="91"/>
    <enumeration value="92"/>
    <enumeration value="93"/>
    <enumeration value="94"/>
    <enumeration value="95"/>
    <enumeration value="96"/>
    <enumeration value="97"/>
    <enumeration value="98"/>
    <enumeration value="ZZZ"/>
  </cl>
  <cl id="13">
    <enumeration value="VAT"/>
  </cl>
  <cl id="14">
    <enumeration value="AE"/>
    <enumeration value="E"/>
    <enumeration value="G"/>
    <enumeration value="K"/>
    <enumeration value="L"/>
    <enumeration value="M"/>
    <enumeration value="O"/>
    <enumeration value="S"/>
    <enumeration value="Z"/>
  </cl>
  <cl id="15">
    <enumeration value="VATEX-EU-132"/>
    <enumeration value="VATEX-EU-132-1A"/>
    <enumeration value="VATEX-EU-132-1B"/>
    <enumeration value="VATEX-EU-132-1C"/>
    <enumeration value="VATEX-EU-132-1D"/>
    <enumeration value="VATEX-EU-132-1E"/>
    <enumeration value="VATEX-EU-132-1F"/>
    <enumeration value="VATEX-EU-132-1G"/>
    <enumeration value="VATEX-EU-132-1H"/>
    <enumeration value="VATEX-EU-132-1I"/>
    <enumeration value="VATEX-EU-132-1J"/>
    <enumeration value="VATEX-EU-132-1K"/>
    <enumeration value="VATEX-EU-132-1L"/>
    <enumeration value="VATEX-EU-132-1M"/>
    <enumeration value="VATEX-EU-132-1N"/>
    <enumeration value="VATEX-EU-132-1O"/>
    <enumeration value="VATEX-EU-132-1P"/>
    <enumeration value="VATEX-EU-132-1Q"/>
    <enumeration value="VATEX-EU-135-1"/>
    <enumeration value="VATEX-EU-143"/>
    <enumeration value="VATEX-EU-143-1A"/>
    <enumeration value="VATEX-EU-143-1B"/>
    <enumeration value="VATEX-EU-143-1C"/>
    <enumeration value="VATEX-EU-143-1D"/>
    <enumeration value="VATEX-EU-143-1E"/>
    <enumeration value="VATEX-EU-143-1F"/>
    <enumeration value="VATEX-EU-143-1FA"/>
    <enumeration value="VATEX-EU-143-1G"/>
    <enumeration value="VATEX-EU-143-1H"/>
    <enumeration value="VATEX-EU-143-1I"/>
    <enumeration value="VATEX-EU-143-1J"/>
    <enumeration value="VATEX-EU-143-1K"/>
    <enumeration value="VATEX-EU-143-1L"/>
    <enumeration value="VATEX-EU-144"/>
    <enumeration value="VATEX-EU-146-1E"/>
    <enumeration value="VATEX-EU-148"/>
    <enumeration value="VATEX-EU-148-A"/>
    <enumeration value="VATEX-EU-148-B"/>
    <enumeration value="VATEX-EU-148-C"/>
    <enumeration value="VATEX-EU-148-D"/>
    <enumeration value="VATEX-EU-148-E"/>
    <enumeration value="VATEX-EU-148-F"/>
    <enumeration value="VATEX-EU-148-G"/>
    <enumeration value="VATEX-EU-151"/>
    <enumeration value="VATEX-EU-151-1A"/>
    <enumeration value="VATEX-EU-151-1AA"/>
    <enumeration value="VATEX-EU-151-1B"/>
    <enumeration value="VATEX-EU-151-1C"/>
    <enumeration value="VATEX-EU-151-1D"/>
    <enumeration value="VATEX-EU-151-1E"/>
    <enumeration value="VATEX-EU-153"/>
    <enumeration value="VATEX-EU-159"/>
    <enumeration value="VATEX-EU-309"/>
    <enumeration value="VATEX-EU-79-C"/>
    <enumeration value="VATEX-EU-AE"/>
    <enumeration value="VATEX-EU-D"/>
    <enumeration value="VATEX-EU-F"/>
    <enumeration value="VATEX-EU-G"/>
    <enumeration value="VATEX-EU-I"/>
    <enumeration value="VATEX-EU-IC"/>
    <enumeration value="VATEX-EU-J"/>
    <enumeration value="VATEX-EU-O"/>
    <enumeration value="VATEX-FR-298SEXDECIESA"/>
    <enumeration value="VATEX-FR-AE"/>
    <enumeration value="VATEX-FR-CGI261-1"/>
    <enumeration value="VATEX-FR-CGI261-2"/>
    <enumeration value="VATEX-FR-CGI261-3"/>
    <enumeration value="VATEX-FR-CGI261-4"/>
    <enumeration value="VATEX-FR-CGI261-5"/>
    <enumeration value="VATEX-FR-CGI261-7"/>
    <enumeration value="VATEX-FR-CGI261-8"/>
    <enumeration value="VATEX-FR-CGI261A"/>
    <enumeration value="VATEX-FR-CGI261B"/>
    <enumeration value="VATEX-FR-CGI261C-1"/>
    <enumeration value="VATEX-FR-CGI261C-2"/>
    <enumeration value="VATEX-FR-CGI261C-3"/>
    <enumeration value="VATEX-FR-CGI261D-1"/>
    <enumeration value="VATEX-FR-CGI261D-1BIS"/>
    <enumeration value="VATEX-FR-CGI261D-2"/>
    <enumeration value="VATEX-FR-CGI261D-3"/>
    <enumeration value="VATEX-FR-CGI261D-4"/>
    <enumeration value="VATEX-FR-CGI261E-1"/>
    <enumeration value="VATEX-FR-CGI261E-2"/>
    <enumeration value="VATEX-FR-CGI275"/>
    <enumeration value="VATEX-FR-CGI277A"/>
    <enumeration value="VATEX-FR-CGI295"/>
    <enumeration value="VATEX-FR-CNWVAT"/>
    <enumeration value="VATEX-FR-FRANCHISE"/>
  </cl>
  <cl id="16">
    <enumeration value="5"/>
    <enumeration value="29"/>
    <enumeration value="72"/>
  </cl>
  <cl id="17">
    <enumeration value="41"/>
    <enumeration value="42"/>
    <enumeration value="60"/>
    <enumeration value="62"/>
    <enumeration value="63"/>
    <enumeration value="64"/>
    <enumeration value="65"/>
    <enumeration value="66"/>
    <enumeration value="67"/>
    <enumeration value="68"/>
    <enumeration value="70"/>
    <enumeration value="71"/>
    <enumeration value="88"/>
    <enumeration value="95"/>
    <enumeration value="100"/>
    <enumeration value="102"/>
    <enumeration value="103"/>
    <enumeration value="104"/>
    <enumeration value="105"/>
  </cl>
  <cl id="18">
    <enumeration value="AA"/>
    <enumeration value="AAA"/>
    <enumeration value="AAC"/>
    <enumeration value="AAD"/>
    <enumeration value="AAE"/>
    <enumeration value="AAF"/>
    <enumeration value="AAH"/>
    <enumeration value="AAI"/>
    <enumeration value="AAS"/>
    <enumeration value="AAT"/>
    <enumeration value="AAV"/>
    <enumeration value="AAY"/>
    <enumeration value="AAZ"/>
    <enumeration value="ABA"/>
    <enumeration value="ABB"/>
    <enumeration value="ABC"/>
    <enumeration value="ABD"/>
    <enumeration value="ABF"/>
    <enumeration value="ABK"/>
    <enumeration value="ABL"/>
    <enumeration value="ABN"/>
    <enumeration value="ABR"/>
    <enumeration value="ABS"/>
    <enumeration value="ABT"/>
    <enumeration value="ABU"/>
    <enumeration value="ACF"/>
    <enumeration value="ACG"/>
    <enumeration value="ACH"/>
    <enumeration value="ACI"/>
    <enumeration value="ACJ"/>
    <enumeration value="ACK"/>
    <enumeration value="ACL"/>
    <enumeration value="ACM"/>
    <enumeration value="ACS"/>
    <enumeration value="ADC"/>
    <enumeration value="ADE"/>
    <enumeration value="ADJ"/>
    <enumeration value="ADK"/>
    <enumeration value="ADL"/>
    <enumeration value="ADM"/>
    <enumeration value="ADN"/>
    <enumeration value="ADO"/>
    <enumeration value="ADP"/>
    <enumeration value="ADQ"/>
    <enumeration value="ADR"/>
    <enumeration value="ADT"/>
    <enumeration value="ADW"/>
    <enumeration value="ADY"/>
    <enumeration value="ADZ"/>
    <enumeration value="AEA"/>
    <enumeration value="AEB"/>
    <enumeration value="AEC"/>
    <enumeration value="AED"/>
    <enumeration value="AEF"/>
    <enumeration value="AEH"/>
    <enumeration value="AEI"/>
    <enumeration value="AEJ"/>
    <enumeration value="AEK"/>
    <enumeration value="AEL"/>
    <enumeration value="AEM"/>
    <enumeration value="AEN"/>
    <enumeration value="AEO"/>
    <enumeration value="AEP"/>
    <enumeration value="AES"/>
    <enumeration value="AET"/>
    <enumeration value="AEU"/>
    <enumeration value="AEV"/>
    <enumeration value="AEW"/>
    <enumeration value="AEX"/>
    <enumeration value="AEY"/>
    <enumeration value="AEZ"/>
    <enumeration value="AJ"/>
    <enumeration value="AU"/>
    <enumeration value="CA"/>
    <enumeration value="CAB"/>
    <enumeration value="CAD"/>
    <enumeration value="CAE"/>
    <enumeration value="CAF"/>
    <enumeration value="CAI"/>
    <enumeration value="CAJ"/>
    <enumeration value="CAK"/>
    <enumeration value="CAL"/>
    <enumeration value="CAM"/>
    <enumeration value="CAN"/>
    <enumeration value="CAO"/>
    <enumeration value="CAP"/>
    <enumeration value="CAQ"/>
    <enumeration value="CAR"/>
    <enumeration value="CAS"/>
    <enumeration value="CAT"/>
    <enumeration value="CAU"/>
    <enumeration value="CAV"/>
    <enumeration value="CAW"/>
    <enumeration value="CAX"/>
    <enumeration value="CAY"/>
    <enumeration value="CAZ"/>
    <enumeration value="CD"/>
    <enumeration value="CG"/>
    <enumeration value="CS"/>
    <enumeration value="CT"/>
    <enumeration value="DAB"/>
    <enumeration value="DAC"/>
    <enumeration value="DAD"/>
    <enumeration value="DAF"/>
    <enumeration value="DAG"/>
    <enumeration value="DAH"/>
    <enumeration value="DAI"/>
    <enumeration value="DAJ"/>
    <enumeration value="DAK"/>
    <enumeration value="DAL"/>
    <enumeration value="DAM"/>
    <enumeration value="DAN"/>
    <enumeration value="DAO"/>
    <enumeration value="DAP"/>
    <enumeration value="DAQ"/>
    <enumeration value="DL"/>
    <enumeration value="EG"/>
    <enumeration value="EP"/>
    <enumeration value="ER"/>
    <enumeration value="FAA"/>
    <enumeration value="FAB"/>
    <enumeration value="FAC"/>
    <enumeration value="FC"/>
    <enumeration value="FH"/>
    <enumeration value="FI"/>
    <enumeration value="GAA"/>
    <enumeration value="HAA"/>
    <enumeration value="HD"/>
    <enumeration value="HH"/>
    <enumeration value="IAA"/>
    <enumeration value="IAB"/>
    <enumeration value="ID"/>
    <enumeration value="IF"/>
    <enumeration value="IR"/>
    <enumeration value="IS"/>
    <enumeration value="KO"/>
    <enumeration value="L1"/>
    <enumeration value="LA"/>
    <enumeration value="LAA"/>
    <enumeration value="LAB"/>
    <enumeration value="LF"/>
    <enumeration value="MAE"/>
    <enumeration value="MI"/>
    <enumeration value="ML"/>
    <enumeration value="NAA"/>
    <enumeration value="OA"/>
    <enumeration value="PA"/>
    <enumeration value="PAA"/>
    <enumeration value="PC"/>
    <enumeration value="PL"/>
    <enumeration value="PRV"/>
    <enumeration value="RAB"/>
    <enumeration value="RAC"/>
    <enumeration value="RAD"/>
    <enumeration value="RAF"/>
    <enumeration value="RE"/>
    <enumeration value="RF"/>
    <enumeration value="RH"/>
    <enumeration value="RV"/>
    <enumeration value="SA"/>
    <enumeration value="SAA"/>
    <enumeration value="SAD"/>
    <enumeration value="SAE"/>
    <enumeration value="SAI"/>
    <enumeration value="SG"/>
    <enumeration value="SH"/>
    <enumeration value="SM"/>
    <enumeration value="SU"/>
    <enumeration value="TAB"/>
    <enumeration value="TAC"/>
    <enumeration value="TT"/>
    <enumeration value="TV"/>
    <enumeration value="V1"/>
    <enumeration value="V2"/>
    <enumeration value="WH"/>
    <enumeration value="XAA"/>
    <enumeration value="YY"/>
    <enumeration value="ZZZ"/>
  </cl>
  <cl id="19">
    <enumeration value="AED"/>
    <enumeration value="AFN"/>
    <enumeration value="ALL"/>
    <enumeration value="AMD"/>
    <enumeration value="AOA"/>
    <enumeration value="ARS"/>
    <enumeration value="AUD"/>
    <enumeration value="AWG"/>
    <enumeration value="AZN"/>
    <enumeration value="BAM"/>
    <enumeration value="BBD"/>
    <enumeration value="BDT"/>
    <enumeration value="BHD"/>
    <enumeration value="BIF"/>
    <enumeration value="BMD"/>
    <enumeration value="BND"/>
    <enumeration value="BOB"/>
    <enumeration value="BOV"/>
    <enumeration value="BRL"/>
    <enumeration value="BSD"/>
    <enumeration value="BTN"/>
    <enumeration value="BWP"/>
    <enumeration value="BYN"/>
    <enumeration value="BZD"/>
    <enumeration value="CAD"/>
    <enumeration value="CDF"/>
    <enumeration value="CHE"/>
    <enumeration value="CHF"/>
    <enumeration value="CHW"/>
    <enumeration value="CLF"/>
    <enumeration value="CLP"/>
    <enumeration value="CNH"/>
    <enumeration value="CNY"/>
    <enumeration value="COP"/>
    <enumeration value="COU"/>
    <enumeration value="CRC"/>
    <enumeration value="CUP"/>
    <enumeration value="CVE"/>
    <enumeration value="CZK"/>
    <enumeration value="DJF"/>
    <enumeration value="DKK"/>
    <enumeration value="DOP"/>
    <enumeration value="DZD"/>
    <enumeration value="EGP"/>
    <enumeration value="ERN"/>
    <enumeration value="ETB"/>
    <enumeration value="EUR"/>
    <enumeration value="FJD"/>
    <enumeration value="FKP"/>
    <enumeration value="GBP"/>
    <enumeration value="GEL"/>
    <enumeration value="GHS"/>
    <enumeration value="GIP"/>
    <enumeration value="GMD"/>
    <enumeration value="GNF"/>
    <enumeration value="GTQ"/>
    <enumeration value="GYD"/>
    <enumeration value="HKD"/>
    <enumeration value="HNL"/>
    <enumeration value="HTG"/>
    <enumeration value="HUF"/>
    <enumeration value="IDR"/>
    <enumeration value="ILS"/>
    <enumeration value="INR"/>
    <enumeration value="IQD"/>
    <enumeration value="IRR"/>
    <enumeration value="ISK"/>
    <enumeration value="JMD"/>
    <enumeration value="JOD"/>
    <enumeration value="JPY"/>
    <enumeration value="KES"/>
    <enumeration value="KGS"/>
    <enumeration value="KHR"/>
    <enumeration value="KMF"/>
    <enumeration value="KPW"/>
    <enumeration value="KRW"/>
    <enumeration value="KWD"/>
    <enumeration value="KYD"/>
    <enumeration value="KZT"/>
    <enumeration value="LAK"/>
    <enumeration value="LBP"/>
    <enumeration value="LKR"/>
    <enumeration value="LRD"/>
    <enumeration value="LSL"/>
    <enumeration value="LYD"/>
    <enumeration value="MAD"/>
    <enumeration value="MDL"/>
    <enumeration value="MGA"/>
    <enumeration value="MKD"/>
    <enumeration value="MMK"/>
    <enumeration value="MNT"/>
    <enumeration value="MOP"/>
    <enumeration value="MRU"/>
    <enumeration value="MUR"/>
    <enumeration value="MVR"/>
    <enumeration value="MWK"/>
    <enumeration value="MXN"/>
    <enumeration value="MXV"/>
    <enumeration value="MYR"/>
    <enumeration value="MZN"/>
    <enumeration value="NAD"/>
    <enumeration value="NGN"/>
    <enumeration value="NIO"/>
    <enumeration value="NOK"/>
    <enumeration value="NPR"/>
    <enumeration value="NZD"/>
    <enumeration value="OMR"/>
    <enumeration value="PAB"/>
    <enumeration value="PEN"/>
    <enumeration value="PGK"/>
    <enumeration value="PHP"/>
    <enumeration value="PKR"/>
    <enumeration value="PLN"/>
    <enumeration value="PYG"/>
    <enumeration value="QAR"/>
    <enumeration value="RON"/>
    <enumeration value="RSD"/>
    <enumeration value="RUB"/>
    <enumeration value="RWF"/>
    <enumeration value="SAR"/>
    <enumeration value="SBD"/>
    <enumeration value="SCR"/>
    <enumeration value="SDG"/>
    <enumeration value="SEK"/>
    <enumeration value="SGD"/>
    <enumeration value="SHP"/>
    <enumeration value="SLE"/>
    <enumeration value="SOS"/>
    <enumeration value="SRD"/>
    <enumeration value="SSP"/>
    <enumeration value="STN"/>
    <enumeration value="SVC"/>
    <enumeration value="SYP"/>
    <enumeration value="SZL"/>
    <enumeration value="THB"/>
    <enumeration value="TJS"/>
    <enumeration value="TMT"/>
    <enumeration value="TND"/>
    <enumeration value="TOP"/>
    <enumeration value="TRY"/>
    <enumeration value="TTD"/>
    <enumeration value="TWD"/>
    <enumeration value="TZS"/>
    <enumeration value="UAH"/>
    <enumeration value="UGX"/>
    <enumeration value="USD"/>
    <enumeration value="USN"/>
    <enumeration value="UYI"/>
    <enumeration value="UYU"/>
    <enumeration value="UYW"/>
    <enumeration value="UZS"/>
    <enumeration value="VED"/>
    <enumeration value="VES"/>
    <enumeration value="VND"/>
    <enumeration value="VUV"/>
    <enumeration value="WST"/>
    <enumeration value="XAF"/>
    <enumeration value="XAG"/>
    <enumeration value="XAU"/>
    <enumeration value="XBA"/>
    <enumeration value="XBB"/>
    <enumeration value="XBC"/>
    <enumeration value="XBD"/>
    <enumeration value="XCD"/>
    <enumeration value="XCG"/>
    <enumeration value="XDR"/>
    <enumeration value="XOF"/>
    <enumeration value="XPD"/>
    <enumeration value="XPF"/>
    <enumeration value="XPT"/>
    <enumeration value="XSU"/>
    <enumeration value="XTS"/>
    <enumeration value="XUA"/>
    <enumeration value="XXX"/>
    <enumeration value="YER"/>
    <enumeration value="ZAR"/>
    <enumeration value="ZMW"/>
    <enumeration value="ZWG"/>
  </cl>
  <cl id="20">
    <enumeration value="AED"/>
    <enumeration value="AFN"/>
    <enumeration value="ALL"/>
    <enumeration value="AMD"/>
    <enumeration value="AOA"/>
    <enumeration value="ARS"/>
    <enumeration value="AUD"/>
    <enumeration value="AWG"/>
    <enumeration value="AZN"/>
    <enumeration value="BAM"/>
    <enumeration value="BBD"/>
    <enumeration value="BDT"/>
    <enumeration value="BHD"/>
    <enumeration value="BIF"/>
    <enumeration value="BMD"/>
    <enumeration value="BND"/>
    <enumeration value="BOB"/>
    <enumeration value="BOV"/>
    <enumeration value="BRL"/>
    <enumeration value="BSD"/>
    <enumeration value="BTN"/>
    <enumeration value="BWP"/>
    <enumeration value="BYN"/>
    <enumeration value="BZD"/>
    <enumeration value="CAD"/>
    <enumeration value="CDF"/>
    <enumeration value="CHE"/>
    <enumeration value="CHF"/>
    <enumeration value="CHW"/>
    <enumeration value="CLF"/>
    <enumeration value="CLP"/>
    <enumeration value="CNH"/>
    <enumeration value="CNY"/>
    <enumeration value="COP"/>
    <enumeration value="COU"/>
    <enumeration value="CRC"/>
    <enumeration value="CUP"/>
    <enumeration value="CVE"/>
    <enumeration value="CZK"/>
    <enumeration value="DJF"/>
    <enumeration value="DKK"/>
    <enumeration value="DOP"/>
    <enumeration value="DZD"/>
    <enumeration value="EGP"/>
    <enumeration value="ERN"/>
    <enumeration value="ETB"/>
    <enumeration value="EUR"/>
    <enumeration value="FJD"/>
    <enumeration value="FKP"/>
    <enumeration value="GBP"/>
    <enumeration value="GEL"/>
    <enumeration value="GHS"/>
    <enumeration value="GIP"/>
    <enumeration value="GMD"/>
    <enumeration value="GNF"/>
    <enumeration value="GTQ"/>
    <enumeration value="GYD"/>
    <enumeration value="HKD"/>
    <enumeration value="HNL"/>
    <enumeration value="HTG"/>
    <enumeration value="HUF"/>
    <enumeration value="IDR"/>
    <enumeration value="ILS"/>
    <enumeration value="INR"/>
    <enumeration value="IQD"/>
    <enumeration value="IRR"/>
    <enumeration value="ISK"/>
    <enumeration value="JMD"/>
    <enumeration value="JOD"/>
    <enumeration value="JPY"/>
    <enumeration value="KES"/>
    <enumeration value="KGS"/>
    <enumeration value="KHR"/>
    <enumeration value="KMF"/>
    <enumeration value="KPW"/>
    <enumeration value="KRW"/>
    <enumeration value="KWD"/>
    <enumeration value="KYD"/>
    <enumeration value="KZT"/>
    <enumeration value="LAK"/>
    <enumeration value="LBP"/>
    <enumeration value="LKR"/>
    <enumeration value="LRD"/>
    <enumeration value="LSL"/>
    <enumeration value="LYD"/>
    <enumeration value="MAD"/>
    <enumeration value="MDL"/>
    <enumeration value="MGA"/>
    <enumeration value="MKD"/>
    <enumeration value="MMK"/>
    <enumeration value="MNT"/>
    <enumeration value="MOP"/>
    <enumeration value="MRU"/>
    <enumeration value="MUR"/>
    <enumeration value="MVR"/>
    <enumeration value="MWK"/>
    <enumeration value="MXN"/>
    <enumeration value="MXV"/>
    <enumeration value="MYR"/>
    <enumeration value="MZN"/>
    <enumeration value="NAD"/>
    <enumeration value="NGN"/>
    <enumeration value="NIO"/>
    <enumeration value="NOK"/>
    <enumeration value="NPR"/>
    <enumeration value="NZD"/>
    <enumeration value="OMR"/>
    <enumeration value="PAB"/>
    <enumeration value="PEN"/>
    <enumeration value="PGK"/>
    <enumeration value="PHP"/>
    <enumeration value="PKR"/>
    <enumeration value="PLN"/>
    <enumeration value="PYG"/>
    <enumeration value="QAR"/>
    <enumeration value="RON"/>
    <enumeration value="RSD"/>
    <enumeration value="RUB"/>
    <enumeration value="RWF"/>
    <enumeration value="SAR"/>
    <enumeration value="SBD"/>
    <enumeration value="SCR"/>
    <enumeration value="SDG"/>
    <enumeration value="SEK"/>
    <enumeration value="SGD"/>
    <enumeration value="SHP"/>
    <enumeration value="SLE"/>
    <enumeration value="SOS"/>
    <enumeration value="SRD"/>
    <enumeration value="SSP"/>
    <enumeration value="STN"/>
    <enumeration value="SVC"/>
    <enumeration value="SYP"/>
    <enumeration value="SZL"/>
    <enumeration value="THB"/>
    <enumeration value="TJS"/>
    <enumeration value="TMT"/>
    <enumeration value="TND"/>
    <enumeration value="TOP"/>
    <enumeration value="TRY"/>
    <enumeration value="TTD"/>
    <enumeration value="TWD"/>
    <enumeration value="TZS"/>
    <enumeration value="UAH"/>
    <enumeration value="UGX"/>
    <enumeration value="USD"/>
    <enumeration value="USN"/>
    <enumeration value="UYI"/>
    <enumeration value="UYU"/>
    <enumeration value="UYW"/>
    <enumeration value="UZS"/>
    <enumeration value="VED"/>
    <enumeration value="VES"/>
    <enumeration value="VND"/>
    <enumeration value="VUV"/>
    <enumeration value="WST"/>
    <enumeration value="XAF"/>
    <enumeration value="XAG"/>
    <enumeration value="XAU"/>
    <enumeration value="XBA"/>
    <enumeration value="XBB"/>
    <enumeration value="XBC"/>
    <enumeration value="XBD"/>
    <enumeration value="XCD"/>
    <enumeration value="XCG"/>
    <enumeration value="XDR"/>
    <enumeration value="XOF"/>
    <enumeration value="XPD"/>
    <enumeration value="XPF"/>
    <enumeration value="XPT"/>
    <enumeration value="XSU"/>
    <enumeration value="XTS"/>
    <enumeration value="XUA"/>
    <enumeration value="XXX"/>
    <enumeration value="YER"/>
    <enumeration value="ZAR"/>
    <enumeration value="ZMW"/>
    <enumeration value="ZWG"/>
  </cl>
  <cl id="21">
    <enumeration value="102"/>
  </cl>
</codedb>
</xsl:variable>
<!--Implementers: please note that overriding process-prolog or process-root is 
    the preferred method for meta-stylesheets to use where possible. -->

<xsl:param name="archiveDirParameter" />
  <xsl:param name="archiveNameParameter" />
  <xsl:param name="fileNameParameter" />
  <xsl:param name="fileDirParameter" />
  <xsl:variable name="document-uri">
    <xsl:value-of select="document-uri(/)" />
  </xsl:variable>

<!--PHASES-->


<!--PROLOG-->
<xsl:output indent="yes" method="xml" omit-xml-declaration="no" standalone="yes" />

<!--XSD TYPES FOR XSLT2-->


<!--KEYS AND FUNCTIONS-->


<!--DEFAULT RULES-->


<!--MODE: SCHEMATRON-SELECT-FULL-PATH-->
<!--This mode can be used to generate an ugly though full XPath for locators-->
<xsl:template match="*" mode="schematron-select-full-path">
    <xsl:apply-templates mode="schematron-get-full-path" select="." />
  </xsl:template>

<!--MODE: SCHEMATRON-FULL-PATH-->
<!--This mode can be used to generate an ugly though full XPath for locators-->
<xsl:template match="*" mode="schematron-get-full-path">
    <xsl:apply-templates mode="schematron-get-full-path" select="parent::*" />
    <xsl:text>/</xsl:text>
    <xsl:choose>
      <xsl:when test="namespace-uri()=''">
        <xsl:value-of select="name()" />
      </xsl:when>
      <xsl:otherwise>
        <xsl:text>*:</xsl:text>
        <xsl:value-of select="local-name()" />
        <xsl:text>[namespace-uri()='</xsl:text>
        <xsl:value-of select="namespace-uri()" />
        <xsl:text>']</xsl:text>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="preceding" select="count(preceding-sibling::*[local-name()=local-name(current())                                   and namespace-uri() = namespace-uri(current())])" />
    <xsl:text>[</xsl:text>
    <xsl:value-of select="1+ $preceding" />
    <xsl:text>]</xsl:text>
  </xsl:template>
  <xsl:template match="@*" mode="schematron-get-full-path">
    <xsl:apply-templates mode="schematron-get-full-path" select="parent::*" />
    <xsl:text>/</xsl:text>
    <xsl:choose>
      <xsl:when test="namespace-uri()=''">@<xsl:value-of select="name()" />
</xsl:when>
      <xsl:otherwise>
        <xsl:text>@*[local-name()='</xsl:text>
        <xsl:value-of select="local-name()" />
        <xsl:text>' and namespace-uri()='</xsl:text>
        <xsl:value-of select="namespace-uri()" />
        <xsl:text>']</xsl:text>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

<!--MODE: SCHEMATRON-FULL-PATH-2-->
<!--This mode can be used to generate prefixed XPath for humans-->
<xsl:template match="node() | @*" mode="schematron-get-full-path-2">
    <xsl:for-each select="ancestor-or-self::*">
      <xsl:text>/</xsl:text>
      <xsl:value-of select="name(.)" />
      <xsl:if test="preceding-sibling::*[name(.)=name(current())]">
        <xsl:text>[</xsl:text>
        <xsl:value-of select="count(preceding-sibling::*[name(.)=name(current())])+1" />
        <xsl:text>]</xsl:text>
      </xsl:if>
    </xsl:for-each>
    <xsl:if test="not(self::*)">
      <xsl:text />/@<xsl:value-of select="name(.)" />
    </xsl:if>
  </xsl:template>
<!--MODE: SCHEMATRON-FULL-PATH-3-->
<!--This mode can be used to generate prefixed XPath for humans 
	(Top-level element has index)-->

<xsl:template match="node() | @*" mode="schematron-get-full-path-3">
    <xsl:for-each select="ancestor-or-self::*">
      <xsl:text>/</xsl:text>
      <xsl:value-of select="name(.)" />
      <xsl:if test="parent::*">
        <xsl:text>[</xsl:text>
        <xsl:value-of select="count(preceding-sibling::*[name(.)=name(current())])+1" />
        <xsl:text>]</xsl:text>
      </xsl:if>
    </xsl:for-each>
    <xsl:if test="not(self::*)">
      <xsl:text />/@<xsl:value-of select="name(.)" />
    </xsl:if>
  </xsl:template>

<!--MODE: GENERATE-ID-FROM-PATH -->
<xsl:template match="/" mode="generate-id-from-path" />
  <xsl:template match="text()" mode="generate-id-from-path">
    <xsl:apply-templates mode="generate-id-from-path" select="parent::*" />
    <xsl:value-of select="concat('.text-', 1+count(preceding-sibling::text()), '-')" />
  </xsl:template>
  <xsl:template match="comment()" mode="generate-id-from-path">
    <xsl:apply-templates mode="generate-id-from-path" select="parent::*" />
    <xsl:value-of select="concat('.comment-', 1+count(preceding-sibling::comment()), '-')" />
  </xsl:template>
  <xsl:template match="processing-instruction()" mode="generate-id-from-path">
    <xsl:apply-templates mode="generate-id-from-path" select="parent::*" />
    <xsl:value-of select="concat('.processing-instruction-', 1+count(preceding-sibling::processing-instruction()), '-')" />
  </xsl:template>
  <xsl:template match="@*" mode="generate-id-from-path">
    <xsl:apply-templates mode="generate-id-from-path" select="parent::*" />
    <xsl:value-of select="concat('.@', name())" />
  </xsl:template>
  <xsl:template match="*" mode="generate-id-from-path" priority="-0.5">
    <xsl:apply-templates mode="generate-id-from-path" select="parent::*" />
    <xsl:text>.</xsl:text>
    <xsl:value-of select="concat('.',name(),'-',1+count(preceding-sibling::*[name()=name(current())]),'-')" />
  </xsl:template>

<!--MODE: GENERATE-ID-2 -->
<xsl:template match="/" mode="generate-id-2">U</xsl:template>
  <xsl:template match="*" mode="generate-id-2" priority="2">
    <xsl:text>U</xsl:text>
    <xsl:number count="*" level="multiple" />
  </xsl:template>
  <xsl:template match="node()" mode="generate-id-2">
    <xsl:text>U.</xsl:text>
    <xsl:number count="*" level="multiple" />
    <xsl:text>n</xsl:text>
    <xsl:number count="node()" />
  </xsl:template>
  <xsl:template match="@*" mode="generate-id-2">
    <xsl:text>U.</xsl:text>
    <xsl:number count="*" level="multiple" />
    <xsl:text>_</xsl:text>
    <xsl:value-of select="string-length(local-name(.))" />
    <xsl:text>_</xsl:text>
    <xsl:value-of select="translate(name(),':','.')" />
  </xsl:template>
<!--Strip characters-->  <xsl:template match="text()" priority="-1" />

<!--SCHEMA SETUP-->
<xsl:template match="/">
    <svrl:schematron-output schemaVersion="iso" title="Schema for Factur-X; 1.09.2; Accounting, BASIC without Lines">
      <xsl:comment>
        <xsl:value-of select="$archiveDirParameter" />   
		 <xsl:value-of select="$archiveNameParameter" />  
		 <xsl:value-of select="$fileNameParameter" />  
		 <xsl:value-of select="$fileDirParameter" />
      </xsl:comment>
      <svrl:ns-prefix-in-attribute-values prefix="rsm" uri="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" />
      <svrl:ns-prefix-in-attribute-values prefix="qdt" uri="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" />
      <svrl:ns-prefix-in-attribute-values prefix="ram" uri="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" />
      <svrl:ns-prefix-in-attribute-values prefix="udt" uri="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M5" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M6" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M7" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M8" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M9" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M10" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M11" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M12" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M13" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M14" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M15" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M16" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M17" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M18" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M19" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M20" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M21" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M22" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M23" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M24" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M25" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M26" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M27" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M28" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M29" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M30" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M31" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M32" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M33" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M34" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M35" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M36" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M37" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M38" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M39" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M40" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M41" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M42" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M43" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M44" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M45" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M46" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M47" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M48" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M49" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M50" select="/" />
      <svrl:active-pattern>
        <xsl:attribute name="document">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:attribute name="documents">
          <xsl:value-of select="document-uri(/)" />
        </xsl:attribute>
        <xsl:apply-templates />
      </svrl:active-pattern>
      <xsl:apply-templates mode="M51" select="/" />
    </svrl:schematron-output>
  </xsl:template>

<!--SCHEMATRON PATTERNS-->
<svrl:text>Schema for Factur-X; 1.09.2; Accounting, BASIC without Lines</svrl:text>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax" mode="M5" priority="1000">
    <svrl:fired-rule context="//ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:BasisAmount)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:BasisAmount)">
          <xsl:attribute name="id">BR-45</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-45]-Each VAT breakdown (BG-23) shall have a VAT category taxable amount (BT-116).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:CalculatedAmount)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:CalculatedAmount)">
          <xsl:attribute name="id">BR-46</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-46]-Each VAT breakdown (BG-23) shall have a VAT category tax amount (BT-117).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:CategoryCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:CategoryCode)">
          <xsl:attribute name="id">BR-47</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-47]-Each VAT breakdown (BG-23) shall be defined through a VAT category code (BT-118).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:RateApplicablePercent) or (ram:CategoryCode = 'O')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:RateApplicablePercent) or (ram:CategoryCode = 'O')">
          <xsl:attribute name="id">BR-48</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-48]-Each VAT breakdown (BG-23) shall have a VAT category rate (BT-119), except if the Invoice is not subject to VAT.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="((ram:TaxPointDate) and not (ram:DueDateTypeCode)) or (not (ram:TaxPointDate) and (ram:DueDateTypeCode)) or (not (ram:TaxPointDate) and not (ram:DueDateTypeCode))" />
      <xsl:otherwise>
        <svrl:failed-assert test="((ram:TaxPointDate) and not (ram:DueDateTypeCode)) or (not (ram:TaxPointDate) and (ram:DueDateTypeCode)) or (not (ram:TaxPointDate) and not (ram:DueDateTypeCode))">
          <xsl:attribute name="id">BR-CO-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-03]-Value added tax point date (BT-7) and Value added tax point date code (BT-8) are mutually exclusive.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(round(.[normalize-space(upper-case(ram:TypeCode)) = 'VAT']/xs:decimal(ram:RateApplicablePercent)) = 0 and (round(xs:decimal(ram:CalculatedAmount)) = 0)) or (round(.[normalize-space(upper-case(ram:TypeCode)) = 'VAT']/xs:decimal(ram:RateApplicablePercent)) != 0 and ((abs(xs:decimal(ram:CalculatedAmount)) - 1 &lt;= round(abs(xs:decimal(ram:BasisAmount)) * (.[normalize-space(upper-case(ram:TypeCode)) = 'VAT']/xs:decimal(ram:RateApplicablePercent) div 100) * 10 * 10) div 100 ) and (abs(xs:decimal(ram:CalculatedAmount)) + 1 >= round(abs(xs:decimal(ram:BasisAmount)) * (.[normalize-space(upper-case(ram:TypeCode)) = 'VAT']/xs:decimal(ram:RateApplicablePercent) div 100) * 10 * 10) div 100 ))) or (not(exists(.[normalize-space(upper-case(ram:TypeCode))='VAT']/xs:decimal(ram:RateApplicablePercent))) and (round(xs:decimal(ram:CalculatedAmount)) = 0))" />
      <xsl:otherwise>
        <svrl:failed-assert test="(round(.[normalize-space(upper-case(ram:TypeCode)) = 'VAT']/xs:decimal(ram:RateApplicablePercent)) = 0 and (round(xs:decimal(ram:CalculatedAmount)) = 0)) or (round(.[normalize-space(upper-case(ram:TypeCode)) = 'VAT']/xs:decimal(ram:RateApplicablePercent)) != 0 and ((abs(xs:decimal(ram:CalculatedAmount)) - 1 &lt;= round(abs(xs:decimal(ram:BasisAmount)) * (.[normalize-space(upper-case(ram:TypeCode)) = 'VAT']/xs:decimal(ram:RateApplicablePercent) div 100) * 10 * 10) div 100 ) and (abs(xs:decimal(ram:CalculatedAmount)) + 1 >= round(abs(xs:decimal(ram:BasisAmount)) * (.[normalize-space(upper-case(ram:TypeCode)) = 'VAT']/xs:decimal(ram:RateApplicablePercent) div 100) * 10 * 10) div 100 ))) or (not(exists(.[normalize-space(upper-case(ram:TypeCode))='VAT']/xs:decimal(ram:RateApplicablePercent))) and (round(xs:decimal(ram:CalculatedAmount)) = 0))">
          <xsl:attribute name="id">BR-CO-17</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-17]-VAT category tax amount (BT-117) = VAT category taxable amount (BT-116) x (VAT category rate (BT-119) / 100), rounded to two decimals.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:BasisAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:BasisAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-19</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-19]-The allowed maximum number of decimals for the VAT category taxable amount (BT-116) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:CalculatedAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:CalculatedAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-20</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-20]-The allowed maximum number of decimals for the VAT category tax amount (BT-117) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M5" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M5" priority="-1" />
  <xsl:template match="@*|node()" mode="M5" priority="-2">
    <xsl:apply-templates mode="M5" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[. = 'Z']" mode="M6" priority="1000">
    <svrl:fired-rule context="//ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[. = 'Z']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="../ram:CalculatedAmount = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="../ram:CalculatedAmount = 0">
          <xsl:attribute name="id">BR-Z-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-Z-09]-The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where VAT category code (BT-118) is "Zero rated" shall equal 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(../ram:ExemptionReason) and not (../ram:ExemptionReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(../ram:ExemptionReason) and not (../ram:ExemptionReasonCode)">
          <xsl:attribute name="id">BR-Z-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-Z-10]-A VAT Breakdown (BG-23) with VAT Category code (BT-118) "Zero rated" shall not have a VAT exemption reason code (BT-121) or VAT exemption reason text (BT-120).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M6" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M6" priority="-1" />
  <xsl:template match="@*|node()" mode="M6" priority="-2">
    <xsl:apply-templates mode="M6" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[.='S']" mode="M7" priority="1000">
    <svrl:fired-rule context="//ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[.='S']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(abs(xs:decimal(../ram:CalculatedAmount)) - 1 &lt; round(abs(xs:decimal(../ram:BasisAmount)) * ../ram:RateApplicablePercent) div 100 ) and (abs(xs:decimal(../ram:CalculatedAmount)) + 1 > round(abs(xs:decimal(../ram:BasisAmount)) * ../ram:RateApplicablePercent) div 100 )" />
      <xsl:otherwise>
        <svrl:failed-assert test="(abs(xs:decimal(../ram:CalculatedAmount)) - 1 &lt; round(abs(xs:decimal(../ram:BasisAmount)) * ../ram:RateApplicablePercent) div 100 ) and (abs(xs:decimal(../ram:CalculatedAmount)) + 1 > round(abs(xs:decimal(../ram:BasisAmount)) * ../ram:RateApplicablePercent) div 100 )">
          <xsl:attribute name="id">BR-S-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-S-09]-The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where VAT category code (BT-118) is "Standard rated" shall equal the VAT category taxable amount (BT-116) multiplied by the VAT category rate (BT-119).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(../ram:ExemptionReason) and not (../ram:ExemptionReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(../ram:ExemptionReason) and not (../ram:ExemptionReasonCode)">
          <xsl:attribute name="id">BR-S-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-S-10]-A VAT Breakdown (BG-23) with VAT Category code (BT-118) "Standard rate" shall not have a VAT exemption reason code (BT-121) or VAT exemption reason text (BT-120).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M7" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M7" priority="-1" />
  <xsl:template match="@*|node()" mode="M7" priority="-2">
    <xsl:apply-templates mode="M7" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:ApplicableHeaderTradeSettlement/ram:BillingSpecifiedPeriod" mode="M8" priority="1000">
    <svrl:fired-rule context="//ram:ApplicableHeaderTradeSettlement/ram:BillingSpecifiedPeriod" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:EndDateTime/udt:DateTimeString[@format = '102']) >= (ram:StartDateTime/udt:DateTimeString[@format = '102']) or not (ram:EndDateTime) or not (ram:StartDateTime)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:EndDateTime/udt:DateTimeString[@format = '102']) >= (ram:StartDateTime/udt:DateTimeString[@format = '102']) or not (ram:EndDateTime) or not (ram:StartDateTime)">
          <xsl:attribute name="id">BR-29</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-29]-If both Invoicing period start date (BT-73) and Invoicing period end date (BT-74) are given then the Invoicing period end date (BT-74) shall be later or equal to the Invoicing period start date (BT-73).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:StartDateTime) or (ram:EndDateTime)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:StartDateTime) or (ram:EndDateTime)">
          <xsl:attribute name="id">BR-CO-19</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-19]-If Invoicing period (BG-14) is used, the Invoicing period start date (BT-73) or the Invoicing period end date (BT-74) shall be filled, or both.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M8" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M8" priority="-1" />
  <xsl:template match="@*|node()" mode="M8" priority="-2">
    <xsl:apply-templates mode="M8" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge/ram:ChargeIndicator[udt:Indicator='false']" mode="M9" priority="1000">
    <svrl:fired-rule context="//ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge/ram:ChargeIndicator[udt:Indicator='false']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:ActualAmount)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:ActualAmount)">
          <xsl:attribute name="id">BR-31</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-31]-Each Document level allowance (BG-20) shall have a Document level allowance amount (BT-92).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:CategoryTradeTax[upper-case(ram:TypeCode) = 'VAT']/ram:CategoryCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:CategoryTradeTax[upper-case(ram:TypeCode) = 'VAT']/ram:CategoryCode)">
          <xsl:attribute name="id">BR-32</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-32]-Each Document level allowance (BG-20) shall have a Document level allowance VAT category code (BT-95).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:Reason) or (../ram:ReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:Reason) or (../ram:ReasonCode)">
          <xsl:attribute name="id">BR-33</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-33]-Each Document level allowance (BG-20) shall have a Document level allowance reason (BT-97) or a Document level allowance reason code (BT-98).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="true()" />
      <xsl:otherwise>
        <svrl:failed-assert test="true()">
          <xsl:attribute name="id">BR-CO-05</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-05]-Document level allowance reason code (BT-98) and Document level allowance reason (BT-97) shall indicate the same type of allowance.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:Reason) or (../ram:ReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:Reason) or (../ram:ReasonCode)">
          <xsl:attribute name="id">BR-CO-21</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-21]-Each Document level allowance (BG-20) shall contain a Document level allowance reason (BT-97) or a Document level allowance reason code (BT-98), or both.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(../ram:ActualAmount[1],'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(../ram:ActualAmount[1],'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-01</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-01]-The allowed maximum number of decimals for the Document level allowance amount (BT-92) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(../ram:BasisAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(../ram:BasisAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-02</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-02]-The allowed maximum number of decimals for the Document level allowance base amount (BT-93) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M9" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M9" priority="-1" />
  <xsl:template match="@*|node()" mode="M9" priority="-2">
    <xsl:apply-templates mode="M9" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge/ram:ChargeIndicator[udt:Indicator='true']" mode="M10" priority="1000">
    <svrl:fired-rule context="//ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge/ram:ChargeIndicator[udt:Indicator='true']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:ActualAmount)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:ActualAmount)">
          <xsl:attribute name="id">BR-36</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-36]-Each Document level charge (BG-21) shall have a Document level charge amount (BT-99).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:CategoryTradeTax[upper-case(ram:TypeCode) = 'VAT']/ram:CategoryCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:CategoryTradeTax[upper-case(ram:TypeCode) = 'VAT']/ram:CategoryCode)">
          <xsl:attribute name="id">BR-37</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-37]-Each Document level charge (BG-21) shall have a Document level charge VAT category code (BT-102).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:Reason) or (../ram:ReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:Reason) or (../ram:ReasonCode)">
          <xsl:attribute name="id">BR-38</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-38]-Each Document level charge (BG-21) shall have a Document level charge reason (BT-104) or a Document level charge reason code (BT-105).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="true()" />
      <xsl:otherwise>
        <svrl:failed-assert test="true()">
          <xsl:attribute name="id">BR-CO-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-06]-Document level charge reason code (BT-105) and Document level charge reason (BT-104) shall indicate the same type of charge.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:Reason) or (../ram:ReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:Reason) or (../ram:ReasonCode)">
          <xsl:attribute name="id">BR-CO-22</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-22]-Each Document level charge (BG-21) shall contain a Document level charge reason (BT-104) or a Document level charge reason code (BT-105), or both.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(../ram:ActualAmount[1],'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(../ram:ActualAmount[1],'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-05</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-05]-The allowed maximum number of decimals for the Document level charge amount (BT-99) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(../ram:BasisAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(../ram:BasisAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-06]-The allowed maximum number of decimals for the Document level charge base amount (BT-100) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M10" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M10" priority="-1" />
  <xsl:template match="@*|node()" mode="M10" priority="-2">
    <xsl:apply-templates mode="M10" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:PayeeTradeParty" mode="M11" priority="1000">
    <svrl:fired-rule context="//ram:PayeeTradeParty" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:Name) and (not(ram:Name = ../ram:SellerTradeParty/ram:Name) and not(ram:ID = ../ram:SellerTradeParty/ram:ID) and not(ram:SpecifiedLegalOrganization/ram:ID = ../ram:SellerTradeParty/ram:SpecifiedLegalOrganization/ram:ID))" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:Name) and (not(ram:Name = ../ram:SellerTradeParty/ram:Name) and not(ram:ID = ../ram:SellerTradeParty/ram:ID) and not(ram:SpecifiedLegalOrganization/ram:ID = ../ram:SellerTradeParty/ram:SpecifiedLegalOrganization/ram:ID))">
          <xsl:attribute name="id">BR-17</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-17]-The Payee name (BT-59) shall be provided in the Invoice, if the Payee (BG-10) is different from the Seller (BG-4).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M11" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M11" priority="-1" />
  <xsl:template match="@*|node()" mode="M11" priority="-2">
    <xsl:apply-templates mode="M11" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SellerTaxRepresentativeTradeParty" mode="M12" priority="1000">
    <svrl:fired-rule context="//ram:SellerTaxRepresentativeTradeParty" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="normalize-space(ram:Name) != ''" />
      <xsl:otherwise>
        <svrl:failed-assert test="normalize-space(ram:Name) != ''">
          <xsl:attribute name="id">BR-18</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-18]-The Seller tax representative name (BT-62) shall be provided in the Invoice, if the Seller (BG-4) has a Seller tax representative party (BG-11).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:PostalTradeAddress)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:PostalTradeAddress)">
          <xsl:attribute name="id">BR-19</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-19]-The Seller tax representative postal address (BG-12) shall be provided in the Invoice, if the Seller (BG-4) has a Seller tax representative party (BG-11).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="normalize-space(ram:PostalTradeAddress/ram:CountryID) != ''" />
      <xsl:otherwise>
        <svrl:failed-assert test="normalize-space(ram:PostalTradeAddress/ram:CountryID) != ''">
          <xsl:attribute name="id">BR-20</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-20]-The Seller tax representative postal address (BG-12) shall contain a Tax representative country code (BT-69), if the Seller (BG-4) has a Seller tax representative party (BG-11).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA']!='')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA']!='')">
          <xsl:attribute name="id">BR-56</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-56]-Each Seller tax representative party (BG-11) shall have a Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M12" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M12" priority="-1" />
  <xsl:template match="@*|node()" mode="M12" priority="-2">
    <xsl:apply-templates mode="M12" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SellerTradeParty" mode="M13" priority="1000">
    <svrl:fired-rule context="//ram:SellerTradeParty" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:ID) or (ram:GlobalID) or (ram:SpecifiedLegalOrganization/ram:ID) or (ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA'])" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:ID) or (ram:GlobalID) or (ram:SpecifiedLegalOrganization/ram:ID) or (ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA'])">
          <xsl:attribute name="id">BR-CO-26</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-26]-In order for the buyer to automatically identify a supplier, the Seller identifier (BT-29), the Seller legal registration identifier (BT-30) and/or the Seller VAT identifier (BT-31) shall be present.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M13" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M13" priority="-1" />
  <xsl:template match="@*|node()" mode="M13" priority="-2">
    <xsl:apply-templates mode="M13" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA']" mode="M14" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="contains(' 1A AD AE AF AG AI AL AM AN AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BL BJ BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH EL ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XI YE YT ZA ZM ZW ', concat(' ', substring(.,1,2), ' '))" />
      <xsl:otherwise>
        <svrl:failed-assert test="contains(' 1A AD AE AF AG AI AL AM AN AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BL BJ BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH EL ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XI YE YT ZA ZM ZW ', concat(' ', substring(.,1,2), ' '))">
          <xsl:attribute name="id">BR-CO-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-09]-The Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63) and the Buyer VAT identifier (BT-48) shall have a prefix in accordance with ISO code ISO 3166-1 alpha-2 by which the country of issue may be identified. Nevertheless, Greece may use the prefix ‘EL’.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M14" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M14" priority="-1" />
  <xsl:template match="@*|node()" mode="M14" priority="-2">
    <xsl:apply-templates mode="M14" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge" mode="M15" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:RateApplicablePercent) &lt;= 1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:RateApplicablePercent) &lt;= 1">
          <xsl:attribute name="id">CII-SR-472</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-472]-Each Specified Trade Allowance Charge (BG-20)(BG-21) should contain a VAT rate (BT-96).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CategoryTradeTax) &lt;= 1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CategoryTradeTax) &lt;= 1">
          <xsl:attribute name="id">CII-SR-471</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-471]-Each Specified Trade Allowance Charge (BG-20)(BG-21) shall contain a VAT category code (BT-95).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ActualAmount) &lt;= 1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ActualAmount) &lt;= 1">
          <xsl:attribute name="id">CII-SR-473</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-473] - ActualAmount should exist maximum once</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:ChargeIndicator)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:ChargeIndicator)">
          <xsl:attribute name="id">CII-SR-463</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-463]-Each Specified Trade Allowance Charge (BG-20)(BG-21) shall contain a Charge Indicator.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M15" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M15" priority="-1" />
  <xsl:template match="@*|node()" mode="M15" priority="-2">
    <xsl:apply-templates mode="M15" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'AE']" mode="M16" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'AE']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and (//ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:BuyerTradeParty/ram:SpecifiedLegalOrganization/ram:ID)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and (//ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:BuyerTradeParty/ram:SpecifiedLegalOrganization/ram:ID)">
          <xsl:attribute name="id">BR-AE-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AE-03]-An Invoice that contains a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Reverse charge" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63) and the Buyer VAT identifier (BT-48) and/or the Buyer legal registration identifier (BT-47).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-AE-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AE-06]-In a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Reverse charge" the Document level allowance VAT rate (BT-96) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M16" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M16" priority="-1" />
  <xsl:template match="@*|node()" mode="M16" priority="-2">
    <xsl:apply-templates mode="M16" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'E']" mode="M17" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'E']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-E-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-E-03]-An Invoice that contains a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Exempt from VAT" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-E-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-E-06]-In a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Exempt from VAT", the Document level allowance VAT rate (BT-96) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M17" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M17" priority="-1" />
  <xsl:template match="@*|node()" mode="M17" priority="-2">
    <xsl:apply-templates mode="M17" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'G']" mode="M18" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'G']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'])" />
      <xsl:otherwise>
        <svrl:failed-assert test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'])">
          <xsl:attribute name="id">BR-G-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-G-03]-An Invoice that contains a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Export outside the EU" shall contain the Seller VAT Identifier (BT-31) or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-G-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-G-06]-In a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Export outside the EU" the Document level allowance VAT rate (BT-96) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M18" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M18" priority="-1" />
  <xsl:template match="@*|node()" mode="M18" priority="-2">
    <xsl:apply-templates mode="M18" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'K']" mode="M19" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'K']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and //ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and //ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-IC-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-IC-03]-An Invoice that contains a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Intra-community supply" shall contain the Seller VAT Identifier (BT-31) or the Seller tax representative VAT identifier (BT-63) and the Buyer VAT identifier (BT-48).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-IC-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-IC-06]-In a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Intra-community supply" the Document level allowance VAT rate (BT-96) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M19" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M19" priority="-1" />
  <xsl:template match="@*|node()" mode="M19" priority="-2">
    <xsl:apply-templates mode="M19" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'L']" mode="M20" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'L']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-AF-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AF-03]-An Invoice that contains a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "IGIC" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent > 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent > 0">
          <xsl:attribute name="id">BR-AF-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AF-06]-In a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "IGIC" the Document level allowance VAT rate (BT-96) shall be 0 (zero) or greater than zero.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M20" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M20" priority="-1" />
  <xsl:template match="@*|node()" mode="M20" priority="-2">
    <xsl:apply-templates mode="M20" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'M']" mode="M21" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'M']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-AG-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AG-03]-An Invoice that contains a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "IPSI" shall contain the Seller VAT Identifier (BT-31), the Seller Tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent >= 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent >= 0">
          <xsl:attribute name="id">BR-AG-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AG-06]-In a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "IPSI" the Document level allowance VAT rate (BT-96) shall be 0 (zero) or greater than zero.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M21" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M21" priority="-1" />
  <xsl:template match="@*|node()" mode="M21" priority="-2">
    <xsl:apply-templates mode="M21" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'O']" mode="M22" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'O']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test=" not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and not (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and not (//ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'])" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and not (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and not (//ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'])">
          <xsl:attribute name="id">BR-O-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-O-03]-An Invoice that contains a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Not subject to VAT" shall not contain the Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63) or the Buyer VAT identifier (BT-48).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(ram:RateApplicablePercent)" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(ram:RateApplicablePercent)">
          <xsl:attribute name="id">BR-O-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-O-06]-A Document level allowance (BG-20) where VAT category code (BT-95) is "Not subject to VAT" shall not contain a Document level allowance VAT rate (BT-96).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M22" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M22" priority="-1" />
  <xsl:template match="@*|node()" mode="M22" priority="-2">
    <xsl:apply-templates mode="M22" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'S']" mode="M23" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'S']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-S-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-S-03]-An Invoice that contains a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Standard rated" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent > 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent > 0">
          <xsl:attribute name="id">BR-S-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-S-06]-In a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Standard rated" the Document level allowance VAT rate (BT-96) shall be greater than zero.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M23" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M23" priority="-1" />
  <xsl:template match="@*|node()" mode="M23" priority="-2">
    <xsl:apply-templates mode="M23" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'Z']" mode="M24" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax[ram:CategoryCode = 'Z']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-Z-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-Z-03]-An Invoice that contains a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Zero rated" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-Z-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-Z-06]-In a Document level allowance (BG-20) where the Document level allowance VAT category code (BT-95) is "Zero rated" the Document level allowance VAT rate (BT-96) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M24" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M24" priority="-1" />
  <xsl:template match="@*|node()" mode="M24" priority="-2">
    <xsl:apply-templates mode="M24" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'AE']" mode="M25" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'AE']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and (//ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:BuyerTradeParty/ram:SpecifiedLegalOrganization/ram:ID)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and (//ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:BuyerTradeParty/ram:SpecifiedLegalOrganization/ram:ID)">
          <xsl:attribute name="id">BR-AE-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AE-04]-An Invoice that contains a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Reverse charge" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63) and the Buyer VAT identifier (BT-48) and/or the Buyer legal registration identifier (BT-47).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-AE-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AE-07]-In a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Reverse charge" the Document level charge VAT rate (BT-103) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M25" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M25" priority="-1" />
  <xsl:template match="@*|node()" mode="M25" priority="-2">
    <xsl:apply-templates mode="M25" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'E']" mode="M26" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'E']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-E-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-E-04]-An Invoice that contains a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Exempt from VAT" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-E-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-E-07]-In a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Exempt from VAT", the Document level charge VAT rate (BT-103) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M26" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M26" priority="-1" />
  <xsl:template match="@*|node()" mode="M26" priority="-2">
    <xsl:apply-templates mode="M26" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'G']" mode="M27" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'G']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'])" />
      <xsl:otherwise>
        <svrl:failed-assert test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'])">
          <xsl:attribute name="id">BR-G-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-G-04]-An Invoice that contains a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Export outside the EU" shall contain the Seller VAT Identifier (BT-31) or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-G-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-G-07]-In a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Export outside the EU" the Document level charge VAT rate (BT-103) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M27" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M27" priority="-1" />
  <xsl:template match="@*|node()" mode="M27" priority="-2">
    <xsl:apply-templates mode="M27" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'K']" mode="M28" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'K']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and //ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="(//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'] or //ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and //ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-IC-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-IC-04]-An Invoice that contains a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Intra-community supply" shall contain the Seller VAT Identifier (BT-31) or the Seller tax representative VAT identifier (BT-63) and the Buyer VAT identifier (BT-48).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-IC-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-IC-07]-In a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Intra-community supply" the Document level charge VAT rate (BT-103) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M28" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M28" priority="-1" />
  <xsl:template match="@*|node()" mode="M28" priority="-2">
    <xsl:apply-templates mode="M28" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'L']" mode="M29" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'L']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-AF-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AF-04]-An Invoice that contains a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "IGIC" shall contain the Seller VAT Identifier (BT-31), the Seller Tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent > 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent > 0">
          <xsl:attribute name="id">BR-AF-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AF-07]-In a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "IGIC" the Document level charge VAT rate (BT-103) shall be 0 (zero) or greater than zero.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M29" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M29" priority="-1" />
  <xsl:template match="@*|node()" mode="M29" priority="-2">
    <xsl:apply-templates mode="M29" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'M']" mode="M30" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'M']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-AG-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AG-04]-An Invoice that contains a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "IPSI" shall contain the Seller VAT Identifier (BT-31), the Seller Tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent >= 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent >= 0">
          <xsl:attribute name="id">BR-AG-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AG-07]-In a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "IPSI" the Document level charge VAT rate (BT-103) shall be 0 (zero) or greater than zero.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M30" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M30" priority="-1" />
  <xsl:template match="@*|node()" mode="M30" priority="-2">
    <xsl:apply-templates mode="M30" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'O']" mode="M31" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'O']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test=" not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and not (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and not (//ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'])" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and not (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']) and not (//ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA'])">
          <xsl:attribute name="id">BR-O-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-O-04]-An Invoice that contains a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Not subject to VAT" shall not contain the Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63) or the Buyer VAT identifier (BT-48).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(ram:RateApplicablePercent)" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(ram:RateApplicablePercent)">
          <xsl:attribute name="id">BR-O-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-O-07]-A Document level charge (BG-21) where the VAT category code (BT-102) is "Not subject to VAT" shall not contain a Document level charge VAT rate (BT-103).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M31" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M31" priority="-1" />
  <xsl:template match="@*|node()" mode="M31" priority="-2">
    <xsl:apply-templates mode="M31" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'S']" mode="M32" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'S']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-S-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-S-04]-An Invoice that contains a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Standard rated" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent > 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent > 0">
          <xsl:attribute name="id">BR-S-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-S-07]-In a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Standard rated" the Document level charge VAT rate (BT-103) shall be greater than zero.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M32" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M32" priority="-1" />
  <xsl:template match="@*|node()" mode="M32" priority="-2">
    <xsl:apply-templates mode="M32" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'Z']" mode="M33" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax[ram:CategoryCode = 'Z']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = ('VA', 'FC')] or /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']">
          <xsl:attribute name="id">BR-Z-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-Z-04]-An Invoice that contains a Document level charge where the Document level charge VAT category code (BT-102) is "Zero rated" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:RateApplicablePercent = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:RateApplicablePercent = 0">
          <xsl:attribute name="id">BR-Z-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-Z-07]-In a Document level charge (BG-21) where the Document level charge VAT category code (BT-102) is "Zero rated" the Document level charge VAT rate (BT-103) shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M33" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M33" priority="-1" />
  <xsl:template match="@*|node()" mode="M33" priority="-2">
    <xsl:apply-templates mode="M33" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeSettlementHeaderMonetarySummation" mode="M34" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeSettlementHeaderMonetarySummation" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:LineTotalAmount)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:LineTotalAmount)">
          <xsl:attribute name="id">BR-12</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-12]-An Invoice shall have the Sum of Invoice line net amount (BT-106).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:TaxBasisTotalAmount)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:TaxBasisTotalAmount)">
          <xsl:attribute name="id">BR-13</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-13]-An Invoice shall have the Invoice total amount without VAT (BT-109).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:GrandTotalAmount)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:GrandTotalAmount)">
          <xsl:attribute name="id">BR-14</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-14]-An Invoice shall have the Invoice total amount with VAT (BT-112).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:DuePayableAmount)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:DuePayableAmount)">
          <xsl:attribute name="id">BR-15</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-15]-An Invoice shall have the Amount due for payment (BT-115).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false'])and not (ram:AllowanceTotalAmount)) or ram:AllowanceTotalAmount = (round(sum(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:ActualAmount)* 10 * 10 ) div 100)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false'])and not (ram:AllowanceTotalAmount)) or ram:AllowanceTotalAmount = (round(sum(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:ActualAmount)* 10 * 10 ) div 100)">
          <xsl:attribute name="id">BR-CO-11</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-11]-Sum of allowances on document level (BT-107) = Σ Document level allowance amount (BT-92).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true'])and not (ram:ChargeTotalAmount)) or (round (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:ChargeTotalAmount * 10 * 10) div 100)= 
round(((round(sum(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:ActualAmount)* 10 * 10 ) div 100) + (round(sum(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedLogisticsServiceCharge/ram:AppliedAmount)* 10 * 10 ) div 100))*10*10) div 100" />
      <xsl:otherwise>
        <svrl:failed-assert test="(not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true'])and not (ram:ChargeTotalAmount)) or (round (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:ChargeTotalAmount * 10 * 10) div 100)= round(((round(sum(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:ActualAmount)* 10 * 10 ) div 100) + (round(sum(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedLogisticsServiceCharge/ram:AppliedAmount)* 10 * 10 ) div 100))*10*10) div 100">
          <xsl:attribute name="id">BR-CO-12</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-12]-Sum of charges on document level (BT-108) = Σ Document level charge amount (BT-99).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(xs:decimal(ram:TaxBasisTotalAmount[1]) = round((xs:decimal(ram:LineTotalAmount[1]) - xs:decimal(ram:AllowanceTotalAmount[1]) + xs:decimal(ram:ChargeTotalAmount[1])) * 10 * 10) div 100)
    or ((xs:decimal(ram:TaxBasisTotalAmount[1]) = round((xs:decimal(ram:LineTotalAmount[1]) - xs:decimal(ram:AllowanceTotalAmount[1])) * 10 * 10) div 100) and not(ram:ChargeTotalAmount))
    or ((xs:decimal(ram:TaxBasisTotalAmount[1]) = round((xs:decimal(ram:LineTotalAmount[1]) + xs:decimal(ram:ChargeTotalAmount[1])) * 10 * 10) div 100) and not(ram:AllowanceTotalAmount))
    or ((xs:decimal(ram:TaxBasisTotalAmount[1]) = round((xs:decimal(ram:LineTotalAmount[1])) * 10 * 10) div 100) and not(ram:ChargeTotalAmount) and not(ram:AllowanceTotalAmount))" />
      <xsl:otherwise>
        <svrl:failed-assert test="(xs:decimal(ram:TaxBasisTotalAmount[1]) = round((xs:decimal(ram:LineTotalAmount[1]) - xs:decimal(ram:AllowanceTotalAmount[1]) + xs:decimal(ram:ChargeTotalAmount[1])) * 10 * 10) div 100) or ((xs:decimal(ram:TaxBasisTotalAmount[1]) = round((xs:decimal(ram:LineTotalAmount[1]) - xs:decimal(ram:AllowanceTotalAmount[1])) * 10 * 10) div 100) and not(ram:ChargeTotalAmount)) or ((xs:decimal(ram:TaxBasisTotalAmount[1]) = round((xs:decimal(ram:LineTotalAmount[1]) + xs:decimal(ram:ChargeTotalAmount[1])) * 10 * 10) div 100) and not(ram:AllowanceTotalAmount)) or ((xs:decimal(ram:TaxBasisTotalAmount[1]) = round((xs:decimal(ram:LineTotalAmount[1])) * 10 * 10) div 100) and not(ram:ChargeTotalAmount) and not(ram:AllowanceTotalAmount))">
          <xsl:attribute name="id">BR-CO-13</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-13]-Invoice total amount without VAT (BT-109) = Σ Invoice line net amount (BT-131) - Sum of allowances on document level (BT-107) + Sum of charges on document level (BT-108).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="every $Currency in /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode
    satisfies
    (
    (
    count(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID = $Currency]) = 1
    and
    xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:GrandTotalAmount)[1])
    =
    round(
    (
    xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxBasisTotalAmount)[1])
    +
    xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID = $Currency])[1])
    ) * 100
    ) div 100
    )
    or
    (
    xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:GrandTotalAmount)[1])
    =
    xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxBasisTotalAmount)[1])
    )
    )" />
      <xsl:otherwise>
        <svrl:failed-assert test="every $Currency in /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode satisfies ( ( count(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID = $Currency]) = 1 and xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:GrandTotalAmount)[1]) = round( ( xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxBasisTotalAmount)[1]) + xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID = $Currency])[1]) ) * 100 ) div 100 ) or ( xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:GrandTotalAmount)[1]) = xs:decimal((/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxBasisTotalAmount)[1]) ) )">
          <xsl:attribute name="id">BR-CO-15</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-15]-Invoice total amount with VAT (BT-112) = Invoice total amount without VAT (BT-109) + Invoice total VAT amount (BT-110).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(xs:decimal(ram:DuePayableAmount[1]) = xs:decimal(ram:GrandTotalAmount[1]) - xs:decimal(ram:TotalPrepaidAmount[1]) + xs:decimal(ram:RoundingAmount[1]))
    or ((xs:decimal(ram:DuePayableAmount[1]) = xs:decimal(ram:GrandTotalAmount[1]) + xs:decimal(ram:RoundingAmount[1])) and not(ram:TotalPrepaidAmount))
    or ((xs:decimal(ram:DuePayableAmount[1]) = xs:decimal(ram:GrandTotalAmount[1]) - xs:decimal(ram:TotalPrepaidAmount[1])) and not(ram:RoundingAmount))
    or ((xs:decimal(ram:DuePayableAmount[1]) = xs:decimal(ram:GrandTotalAmount[1])) and not(ram:TotalPrepaidAmount) and not(ram:RoundingAmount))" />
      <xsl:otherwise>
        <svrl:failed-assert test="(xs:decimal(ram:DuePayableAmount[1]) = xs:decimal(ram:GrandTotalAmount[1]) - xs:decimal(ram:TotalPrepaidAmount[1]) + xs:decimal(ram:RoundingAmount[1])) or ((xs:decimal(ram:DuePayableAmount[1]) = xs:decimal(ram:GrandTotalAmount[1]) + xs:decimal(ram:RoundingAmount[1])) and not(ram:TotalPrepaidAmount)) or ((xs:decimal(ram:DuePayableAmount[1]) = xs:decimal(ram:GrandTotalAmount[1]) - xs:decimal(ram:TotalPrepaidAmount[1])) and not(ram:RoundingAmount)) or ((xs:decimal(ram:DuePayableAmount[1]) = xs:decimal(ram:GrandTotalAmount[1])) and not(ram:TotalPrepaidAmount) and not(ram:RoundingAmount))">
          <xsl:attribute name="id">BR-CO-16</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-16]-Amount due for payment (BT-115) = Invoice total amount with VAT (BT-112) -Paid amount (BT-113) +Rounding amount (BT-114).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:LineTotalAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:LineTotalAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-09]-The allowed maximum number of decimals for the Sum of Invoice line net amount (BT-106) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:AllowanceTotalAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:AllowanceTotalAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-10]-The allowed maximum number of decimals for the Sum of allowances on document level (BT-107) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:ChargeTotalAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:ChargeTotalAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-11</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-11]-The allowed maximum number of decimals for the Sum of charges on document level (BT-108) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:TaxBasisTotalAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:TaxBasisTotalAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-12</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-12]-The allowed maximum number of decimals for the Invoice total amount without VAT (BT-109) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(ram:TaxTotalAmount) or ram:TaxTotalAmount[(@currencyID =/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode and . = round(. * 100) div 100) or not (@currencyID =/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode)]" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(ram:TaxTotalAmount) or ram:TaxTotalAmount[(@currencyID =/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode and . = round(. * 100) div 100) or not (@currencyID =/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode)]">
          <xsl:attribute name="id">BR-DEC-13</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-13]-The allowed maximum number of decimals for the Invoice total VAT amount (BT-110) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:GrandTotalAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:GrandTotalAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-14</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-14]-The allowed maximum number of decimals for the Invoice total amount with VAT (BT-112) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(ram:TaxTotalAmount) or ram:TaxTotalAmount[(@currencyID =/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode and . = round(. * 100) div 100) or not (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode)]" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(ram:TaxTotalAmount) or ram:TaxTotalAmount[(@currencyID =/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode and . = round(. * 100) div 100) or not (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode)]">
          <xsl:attribute name="id">BR-DEC-15</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-15]-The allowed maximum number of decimals for the Invoice total VAT amount in accounting currency (BT-111) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:TotalPrepaidAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:TotalPrepaidAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-16</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-16]-The allowed maximum number of decimals for the Paid amount (BT-113) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:RoundingAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:RoundingAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-17</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-17]-The allowed maximum number of decimals for the Rounding amount (BT-114) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length(substring-after(ram:DuePayableAmount,'.'))&lt;=2" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length(substring-after(ram:DuePayableAmount,'.'))&lt;=2">
          <xsl:attribute name="id">BR-DEC-18</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-DEC-18]-The allowed maximum number of decimals for the Amount due for payment (BT-115) is 2.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode) or (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode and (ram:TaxTotalAmount/@currencyID = /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode) and not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode = /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode))" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode) or (/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode and (ram:TaxTotalAmount/@currencyID = /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode) and not(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode = /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode))">
          <xsl:attribute name="id">BR-53</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-53]-If the VAT accounting currency code (BT-6) is present, then the Invoice total VAT amount in accounting currency (BT-111) shall be provided.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M34" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M34" priority="-1" />
  <xsl:template match="@*|node()" mode="M34" priority="-2">
    <xsl:apply-templates mode="M34" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID=/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode]" mode="M35" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID=/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode]" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test=". = (round(sum(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CalculatedAmount)*10*10)div 100)" />
      <xsl:otherwise>
        <svrl:failed-assert test=". = (round(sum(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CalculatedAmount)*10*10)div 100)">
          <xsl:attribute name="id">BR-CO-14</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-14]-Invoice total VAT amount (BT-110) = Σ VAT category tax amount (BT-117).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M35" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M35" priority="-1" />
  <xsl:template match="@*|node()" mode="M35" priority="-2">
    <xsl:apply-templates mode="M35" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeSettlementPaymentMeans" mode="M36" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeSettlementPaymentMeans" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:TypeCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:TypeCode)">
          <xsl:attribute name="id">BR-49</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-49]-A Payment instruction (BG-16) shall specify the Payment means type code (BT-81).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:PayeeSpecifiedCreditorFinancialInstitution or ram:PayerSpecifiedDebtorFinancialInstitution) or (not(ram:PayeeSpecifiedCreditorFinancialInstitution) and not(ram:PayerSpecifiedDebtorFinancialInstitution))" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:PayeeSpecifiedCreditorFinancialInstitution or ram:PayerSpecifiedDebtorFinancialInstitution) or (not(ram:PayeeSpecifiedCreditorFinancialInstitution) and not(ram:PayerSpecifiedDebtorFinancialInstitution))">
          <xsl:attribute name="id">CII-SR-464</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-464]-Only one BT-86 element is allowed on an invoice.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M36" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M36" priority="-1" />
  <xsl:template match="@*|node()" mode="M36" priority="-2">
    <xsl:apply-templates mode="M36" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeSettlementPaymentMeans[ram:TypeCode='30' or ram:TypeCode='58']/ram:PayeePartyCreditorFinancialAccount" mode="M37" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeSettlementPaymentMeans[ram:TypeCode='30' or ram:TypeCode='58']/ram:PayeePartyCreditorFinancialAccount" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="normalize-space(ram:IBANID) != '' or normalize-space(ram:ProprietaryID) != ''" />
      <xsl:otherwise>
        <svrl:failed-assert test="normalize-space(ram:IBANID) != '' or normalize-space(ram:ProprietaryID) != ''">
          <xsl:attribute name="id">BR-50</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-50]-A Payment account identifier (BT-84) shall be present if Credit transfer (BG-16) information is provided in the Invoice.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:IBANID) or (ram:ProprietaryID)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:IBANID) or (ram:ProprietaryID)">
          <xsl:attribute name="id">BR-61</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-61]-If the Payment means type code (BT-81) means SEPA credit transfer, Local credit transfer or Non-SEPA international credit transfer, the Payment account identifier (BT-84) shall be present.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M37" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M37" priority="-1" />
  <xsl:template match="@*|node()" mode="M37" priority="-2">
    <xsl:apply-templates mode="M37" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//ram:SpecifiedTradeSettlementPaymentMeans[some $code in tokenize('30 58', '\s')  satisfies normalize-space(ram:TypeCode) = $code]" mode="M38" priority="1000">
    <svrl:fired-rule context="//ram:SpecifiedTradeSettlementPaymentMeans[some $code in tokenize('30 58', '\s')  satisfies normalize-space(ram:TypeCode) = $code]" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:PayeePartyCreditorFinancialAccount/ram:IBANID or ram:PayeePartyCreditorFinancialAccount/ram:ProprietaryID) and not(ram:PayeePartyCreditorFinancialAccount/ram:IBANID and ram:PayeePartyCreditorFinancialAccount/ram:ProprietaryID)
" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:PayeePartyCreditorFinancialAccount/ram:IBANID or ram:PayeePartyCreditorFinancialAccount/ram:ProprietaryID) and not(ram:PayeePartyCreditorFinancialAccount/ram:IBANID and ram:PayeePartyCreditorFinancialAccount/ram:ProprietaryID)">
          <xsl:attribute name="id">CII-SR-470</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-470]-Either the IBAN or a Proprietary ID (BT-84) shall be used.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M38" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M38" priority="-1" />
  <xsl:template match="@*|node()" mode="M38" priority="-2">
    <xsl:apply-templates mode="M38" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement" mode="M39" priority="1000">
    <svrl:fired-rule context="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:ApplicableTradeTax" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:ApplicableTradeTax">
          <xsl:attribute name="id">BR-CO-18</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-CO-18]-An Invoice shall at least have one VAT breakdown group (BG-23).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M39" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M39" priority="-1" />
  <xsl:template match="@*|node()" mode="M39" priority="-2">
    <xsl:apply-templates mode="M39" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[. = 'AE']" mode="M40" priority="1000">
    <svrl:fired-rule context="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[. = 'AE']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="../ram:CalculatedAmount = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="../ram:CalculatedAmount = 0">
          <xsl:attribute name="id">BR-AE-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AE-09]-The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Reverse charge" shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:ExemptionReason) or (../ram:ExemptionReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:ExemptionReason) or (../ram:ExemptionReasonCode)">
          <xsl:attribute name="id">BR-AE-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AE-10]-A VAT Breakdown (BG-23) with VAT Category code (BT-118) "Reverse charge" shall have a VAT exemption reason code (BT-121), meaning "Reverse charge" or the VAT exemption reason text (BT-120) "Reverse charge" (or the equivalent standard text in another language).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M40" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M40" priority="-1" />
  <xsl:template match="@*|node()" mode="M40" priority="-2">
    <xsl:apply-templates mode="M40" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[. = 'E']" mode="M41" priority="1000">
    <svrl:fired-rule context="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[. = 'E']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="../ram:CalculatedAmount = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="../ram:CalculatedAmount = 0">
          <xsl:attribute name="id">BR-E-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-E-09]-The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where the VAT category code (BT-118) equals "Exempt from VAT" shall equal 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:ExemptionReason) or (../ram:ExemptionReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:ExemptionReason) or (../ram:ExemptionReasonCode)">
          <xsl:attribute name="id">BR-E-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-E-10]-A VAT Breakdown (BG-23) with VAT Category code (BT-118) "Exempt from VAT" shall have a VAT exemption reason code (BT-121) or a VAT exemption reason text (BT-120).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M41" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M41" priority="-1" />
  <xsl:template match="@*|node()" mode="M41" priority="-2">
    <xsl:apply-templates mode="M41" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[. = 'G']" mode="M42" priority="1000">
    <svrl:fired-rule context="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[. = 'G']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="../ram:CalculatedAmount = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="../ram:CalculatedAmount = 0">
          <xsl:attribute name="id">BR-G-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-G-09]-The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Export outside the EU" shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:ExemptionReason) or (../ram:ExemptionReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:ExemptionReason) or (../ram:ExemptionReasonCode)">
          <xsl:attribute name="id">BR-G-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-G-10]-A VAT Breakdown (BG-23) with the VAT Category code (BT-118) "Export outside the EU" shall have a VAT exemption reason code (BT-121), meaning "Export outside the EU" or the VAT exemption reason text (BT-120) "Export outside the EU" (or the equivalent standard text in another language).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M42" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M42" priority="-1" />
  <xsl:template match="@*|node()" mode="M42" priority="-2">
    <xsl:apply-templates mode="M42" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[.= 'K']" mode="M43" priority="1000">
    <svrl:fired-rule context="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode[.= 'K']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="../ram:CalculatedAmount = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="../ram:CalculatedAmount = 0">
          <xsl:attribute name="id">BR-IC-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-IC-09]-The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Intra-community supply" shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(../ram:ExemptionReason) or (../ram:ExemptionReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(../ram:ExemptionReason) or (../ram:ExemptionReasonCode)">
          <xsl:attribute name="id">BR-IC-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-IC-10]-A VAT Breakdown (BG-23) with the VAT Category code (BT-118) "Intra-community supply" shall have a VAT exemption reason code (BT-121), meaning "Intra-community supply" or the VAT exemption reason text (BT-120) "Intra-community supply" (or the equivalent standard text in another language).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString) or (../../ram:BillingSpecifiedPeriod/ram:StartDateTime) or (../../ram:BillingSpecifiedPeriod/ram:EndDateTime)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString) or (../../ram:BillingSpecifiedPeriod/ram:StartDateTime) or (../../ram:BillingSpecifiedPeriod/ram:EndDateTime)">
          <xsl:attribute name="id">BR-IC-11</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-IC-11]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14) shall not be blank.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:PostalTradeAddress/ram:CountryID" />
      <xsl:otherwise>
        <svrl:failed-assert test="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:PostalTradeAddress/ram:CountryID">
          <xsl:attribute name="id">BR-IC-12</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-IC-12]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Intra-community supply" the Deliver to country code (BT-80) shall not be blank.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M43" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M43" priority="-1" />
  <xsl:template match="@*|node()" mode="M43" priority="-2">
    <xsl:apply-templates mode="M43" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax[ram:CategoryCode = 'L']" mode="M44" priority="1000">
    <svrl:fired-rule context="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax[ram:CategoryCode = 'L']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="true()" />
      <xsl:otherwise>
        <svrl:failed-assert test="true()">
          <xsl:attribute name="id">BR-AF-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AF-09]-The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where VAT category code (BT-118) is "IGIC" shall equal the VAT category taxable amount (BT-116) multiplied by the VAT category rate (BT-119).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(ram:ExemptionReason) and not (ram:ExemptionReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(ram:ExemptionReason) and not (ram:ExemptionReasonCode)">
          <xsl:attribute name="id">BR-AF-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AF-10]-A VAT Breakdown (BG-23) with VAT Category code (BT-118) "IGIC" shall not have a VAT exemption reason code (BT-121) or VAT exemption reason text (BT-120).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M44" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M44" priority="-1" />
  <xsl:template match="@*|node()" mode="M44" priority="-2">
    <xsl:apply-templates mode="M44" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax[ram:CategoryCode = 'M']" mode="M45" priority="1000">
    <svrl:fired-rule context="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax[ram:CategoryCode = 'M']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="true()" />
      <xsl:otherwise>
        <svrl:failed-assert test="true()">
          <xsl:attribute name="id">BR-AG-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AG-09]-The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where VAT category code (BT-118) is "IPSI" shall equal the VAT category taxable amount (BT-116) multiplied by the VAT category rate (BT-119).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(ram:ExemptionReason) and not (ram:ExemptionReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(ram:ExemptionReason) and not (ram:ExemptionReasonCode)">
          <xsl:attribute name="id">BR-AG-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-AG-10]-A VAT Breakdown (BG-23) with VAT Category code (BT-118) "IPSI" shall not have a VAT exemption reason code (BT-121) or VAT exemption reason text (BT-120).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M45" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M45" priority="-1" />
  <xsl:template match="@*|node()" mode="M45" priority="-2">
    <xsl:apply-templates mode="M45" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax[ram:CategoryCode = 'O']" mode="M46" priority="1000">
    <svrl:fired-rule context="//rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax[ram:CategoryCode = 'O']" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="ram:CalculatedAmount = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="ram:CalculatedAmount = 0">
          <xsl:attribute name="id">BR-O-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-O-09]-The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Not subject to VAT" shall be 0 (zero).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:ExemptionReason) or (ram:ExemptionReasonCode)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:ExemptionReason) or (ram:ExemptionReasonCode)">
          <xsl:attribute name="id">BR-O-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-O-10]-A VAT Breakdown (BG-23) with VAT Category code (BT-118) " Not subject to VAT" shall have a VAT exemption reason code (BT-121), meaning " Not subject to VAT" or a VAT exemption reason text (BT-120) " Not subject to VAT" (or the equivalent standard text in another language).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(//ram:ApplicableTradeTax[ram:CategoryCode != 'O'])" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(//ram:ApplicableTradeTax[ram:CategoryCode != 'O'])">
          <xsl:attribute name="id">BR-O-11</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-O-11]-An Invoice that contains a VAT breakdown group (BG-23) with a VAT category code (BT-118) "Not subject to VAT" shall not contain other VAT breakdown groups (BG-23).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(//ram:CategoryTradeTax[ram:CategoryCode != 'O'])" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(//ram:CategoryTradeTax[ram:CategoryCode != 'O'])">
          <xsl:attribute name="id">BR-O-13</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-O-13]-An Invoice that contains a VAT breakdown group (BG-23) with a VAT category code (BT-118) "Not subject to VAT" shall not contain Document level allowances (BG-20) where Document level allowance VAT category code (BT-95) is not "Not subject to VAT".</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(//ram:CategoryTradeTax[ram:CategoryCode != 'O'])" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(//ram:CategoryTradeTax[ram:CategoryCode != 'O'])">
          <xsl:attribute name="id">BR-O-14</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-O-14]-An Invoice that contains a VAT breakdown group (BG-23) with a VAT category code (BT-118) "Not subject to VAT" shall not contain Document level charges (BG-21) where Document level charge VAT category code (BT-102) is not "Not subject to VAT".</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M46" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M46" priority="-1" />
  <xsl:template match="@*|node()" mode="M46" priority="-2">
    <xsl:apply-templates mode="M46" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice" mode="M47" priority="1000">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID != '')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID != '')">
          <xsl:attribute name="id">BR-01</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-01]-An Invoice shall have a Specification identifier (BT-24).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(rsm:ExchangedDocument/ram:ID !='')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(rsm:ExchangedDocument/ram:ID !='')">
          <xsl:attribute name="id">BR-02</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-02]-An Invoice shall have an Invoice number (BT-1).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString[@format='102']!='')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString[@format='102']!='')">
          <xsl:attribute name="id">BR-03</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-03]-An Invoice shall have an Invoice issue date (BT-2).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(rsm:ExchangedDocument/ram:TypeCode!='')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(rsm:ExchangedDocument/ram:TypeCode!='')">
          <xsl:attribute name="id">BR-04</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-04]-An Invoice shall have an Invoice type code (BT-3).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode!='')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode!='')">
          <xsl:attribute name="id">BR-05</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-05]-An Invoice shall have an Invoice currency code (BT-5).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:Name!='')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:Name!='')">
          <xsl:attribute name="id">BR-06</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-06]-An Invoice shall contain the Seller name (BT-27).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:Name!='')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:Name!='')">
          <xsl:attribute name="id">BR-07</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-07]-An Invoice shall contain the Buyer name (BT-44).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="//ram:SellerTradeParty/ram:PostalTradeAddress" />
      <xsl:otherwise>
        <svrl:failed-assert test="//ram:SellerTradeParty/ram:PostalTradeAddress">
          <xsl:attribute name="id">BR-08</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-08]-An Invoice shall contain the Seller postal address (BG-5).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="//ram:SellerTradeParty/ram:PostalTradeAddress/ram:CountryID!=''" />
      <xsl:otherwise>
        <svrl:failed-assert test="//ram:SellerTradeParty/ram:PostalTradeAddress/ram:CountryID!=''">
          <xsl:attribute name="id">BR-09</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-09]-The Seller postal address (BG-5) shall contain a Seller country code (BT-40).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="//ram:BuyerTradeParty/ram:PostalTradeAddress" />
      <xsl:otherwise>
        <svrl:failed-assert test="//ram:BuyerTradeParty/ram:PostalTradeAddress">
          <xsl:attribute name="id">BR-10</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-10]-An Invoice shall contain the Buyer postal address (BG-8).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="//ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CountryID!=''" />
      <xsl:otherwise>
        <svrl:failed-assert test="//ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CountryID!=''">
          <xsl:attribute name="id">BR-11</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-11]-The Buyer postal address shall contain a Buyer country code (BT-55).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="normalize-space(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:URIUniversalCommunication[1]/ram:URIID/@schemeID) != '' or not (rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:URIUniversalCommunication)" />
      <xsl:otherwise>
        <svrl:failed-assert test="normalize-space(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:URIUniversalCommunication[1]/ram:URIID/@schemeID) != '' or not (rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:URIUniversalCommunication)">
          <xsl:attribute name="id">BR-62</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-62]-The Seller electronic address (BT-34) shall have a Scheme identifier.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="normalize-space(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:URIUniversalCommunication[1]/ram:URIID/@schemeID) != '' or not (rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:URIUniversalCommunication)" />
      <xsl:otherwise>
        <svrl:failed-assert test="normalize-space(rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:URIUniversalCommunication[1]/ram:URIID/@schemeID) != '' or not (rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:URIUniversalCommunication)">
          <xsl:attribute name="id">BR-63</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-63]-The Buyer electronic address (BT-49) shall have a Scheme identifier.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(//ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode[normalize-space(.) != normalize-space((//ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode)[1])]) = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(//ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode[normalize-space(.) != normalize-space((//ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode)[1])]) = 0">
          <xsl:attribute name="id">CII-SR-467</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-467] - All Payment means type codes (BT-81) shall have the same value across all SpecifiedTradeSettlementPaymentMeans.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(//ram:SpecifiedTradeSettlementPaymentMeans/ram:Information[normalize-space(.) != normalize-space((//ram:SpecifiedTradeSettlementPaymentMeans/ram:Information)[1])]) = 0" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(//ram:SpecifiedTradeSettlementPaymentMeans/ram:Information[normalize-space(.) != normalize-space((//ram:SpecifiedTradeSettlementPaymentMeans/ram:Information)[1])]) = 0">
          <xsl:attribute name="id">CII-SR-468</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-468] - All Payment means texts (BT-82) shall have the same value across all SpecifiedTradeSettlementPaymentMeans.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(//ram:ApplicableHeaderTradeSettlement/ram:PaymentReference) &lt;= 1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(//ram:ApplicableHeaderTradeSettlement/ram:PaymentReference) &lt;= 1">
          <xsl:attribute name="id">CII-SR-469</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-469] - Payment reference (BT-83) shall occur at most once in the document.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M47" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M47" priority="-1" />
  <xsl:template match="@*|node()" mode="M47" priority="-2">
    <xsl:apply-templates mode="M47" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement" mode="M48" priority="1000">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(ram:SellerTradeParty/ram:DefinedTradeContact/ram:PersonName and ram:SellerTradeParty/ram:DefinedTradeContact/ram:DepartmentName)" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(ram:SellerTradeParty/ram:DefinedTradeContact/ram:PersonName and ram:SellerTradeParty/ram:DefinedTradeContact/ram:DepartmentName)">
          <xsl:attribute name="id">CII-SR-465</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-465]-Only one BT-41 element is allowed on an invoice.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="not(ram:BuyerTradeParty/ram:DefinedTradeContact/ram:PersonName and ram:BuyerTradeParty/ram:DefinedTradeContact/ram:DepartmentName)" />
      <xsl:otherwise>
        <svrl:failed-assert test="not(ram:BuyerTradeParty/ram:DefinedTradeContact/ram:PersonName and ram:BuyerTradeParty/ram:DefinedTradeContact/ram:DepartmentName)">
          <xsl:attribute name="id">CII-SR-466</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[CII-SR-466]-Only one BT-56 element is allowed on an invoice.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:SellerTradeParty)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:SellerTradeParty)=1">
          <xsl:attribute name="id">FX-SCH-A-000027</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:SellerTradeParty' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:BuyerTradeParty)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:BuyerTradeParty)=1">
          <xsl:attribute name="id">FX-SCH-A-000028</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:BuyerTradeParty' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M48" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M48" priority="-1" />
  <xsl:template match="@*|node()" mode="M48" priority="-2">
    <xsl:apply-templates mode="M48" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery" mode="M49" priority="1000">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:ShipToTradeParty/ram:PostalTradeAddress and ram:ShipToTradeParty/ram:PostalTradeAddress/ram:CountryID!='') or not (ram:ShipToTradeParty/ram:PostalTradeAddress)" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:ShipToTradeParty/ram:PostalTradeAddress and ram:ShipToTradeParty/ram:PostalTradeAddress/ram:CountryID!='') or not (ram:ShipToTradeParty/ram:PostalTradeAddress)">
          <xsl:attribute name="id">BR-57</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-57]-Each Deliver to address (BG-15) shall contain a Deliver to country code (BT-80).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M49" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M49" priority="-1" />
  <xsl:template match="@*|node()" mode="M49" priority="-2">
    <xsl:apply-templates mode="M49" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceReferencedDocument" mode="M50" priority="1000">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceReferencedDocument" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="(ram:IssuerAssignedID!='')" />
      <xsl:otherwise>
        <svrl:failed-assert test="(ram:IssuerAssignedID!='')">
          <xsl:attribute name="id">BR-55</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	[BR-55]-Each Preceding Invoice reference (BG-3) shall contain a Preceding Invoice reference (BT-25).</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:IssuerAssignedID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:IssuerAssignedID)=1">
          <xsl:attribute name="id">FX-SCH-A-000415</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:IssuerAssignedID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M50" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M50" priority="-1" />
  <xsl:template match="@*|node()" mode="M50" priority="-2">
    <xsl:apply-templates mode="M50" select="@*|*" />
  </xsl:template>

<!--PATTERN -->


	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument" mode="M51" priority="1132">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)=1">
          <xsl:attribute name="id">FX-SCH-A-000019</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:TypeCode)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:TypeCode)=1">
          <xsl:attribute name="id">FX-SCH-A-000020</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:TypeCode' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:ID" mode="M51" priority="1131">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:ID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IncludedNote" mode="M51" priority="1130">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IncludedNote" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:Content)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:Content)=1">
          <xsl:attribute name="id">FX-SCH-A-000160</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:Content' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:SubjectCode)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:SubjectCode)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000161</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:SubjectCode' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IncludedNote/ram:SubjectCode" mode="M51" priority="1129">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IncludedNote/ram:SubjectCode" />
    <xsl:variable name="codeValue4" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue4)=0 or $__bundled_facturx_codes/codedb/cl[@id=4]/enumeration[@value=$codeValue4]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue4)=0 or $__bundled_facturx_codes/codedb/cl[@id=4]/enumeration[@value=$codeValue4]">
          <xsl:attribute name="id">FX-SCH-A-000162</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:SubjectCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString" mode="M51" priority="1128">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@format" />
      <xsl:otherwise>
        <svrl:failed-assert test="@format">
          <xsl:attribute name="id">FX-SCH-A-000021</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@format' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue3" select="@format" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]">
          <xsl:attribute name="id">FX-SCH-A-000416</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@format' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:TypeCode" mode="M51" priority="1127">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:TypeCode" />
    <xsl:variable name="codeValue2" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue2)=0 or $__bundled_facturx_codes/codedb/cl[@id=2]/enumeration[@value=$codeValue2]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue2)=0 or $__bundled_facturx_codes/codedb/cl[@id=2]/enumeration[@value=$codeValue2]">
          <xsl:attribute name="id">FX-SCH-A-000417</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:TypeCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext" mode="M51" priority="1126">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:BusinessProcessSpecifiedDocumentContextParameter)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:BusinessProcessSpecifiedDocumentContextParameter)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000024</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:BusinessProcessSpecifiedDocumentContextParameter' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:GuidelineSpecifiedDocumentContextParameter)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:GuidelineSpecifiedDocumentContextParameter)=1">
          <xsl:attribute name="id">FX-SCH-A-000025</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:GuidelineSpecifiedDocumentContextParameter' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:BusinessProcessSpecifiedDocumentContextParameter" mode="M51" priority="1125">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:BusinessProcessSpecifiedDocumentContextParameter" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)=1">
          <xsl:attribute name="id">FX-SCH-A-000406</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID" mode="M51" priority="1124">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter" mode="M51" priority="1123">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)=1">
          <xsl:attribute name="id">FX-SCH-A-000407</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID" mode="M51" priority="1122">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID" />
    <xsl:variable name="codeValue1" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue1)=0 or $__bundled_facturx_codes/codedb/cl[@id=1]/enumeration[@value=$codeValue1]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue1)=0 or $__bundled_facturx_codes/codedb/cl[@id=1]/enumeration[@value=$codeValue1]">
          <xsl:attribute name="id">FX-SCH-A-000418</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:ID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerOrderReferencedDocument" mode="M51" priority="1121">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerOrderReferencedDocument" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:IssuerAssignedID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:IssuerAssignedID)=1">
          <xsl:attribute name="id">FX-SCH-A-000029</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:IssuerAssignedID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerOrderReferencedDocument/ram:FormattedIssueDateTime" mode="M51" priority="1120">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerOrderReferencedDocument/ram:FormattedIssueDateTime" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:FormattedIssueDateTime' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID" mode="M51" priority="1119">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty" mode="M51" priority="1118">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000163</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:GlobalID)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:GlobalID)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000164</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:GlobalID' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:Name)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:Name)=1">
          <xsl:attribute name="id">FX-SCH-A-000030</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:Name' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:PostalTradeAddress)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:PostalTradeAddress)=1">
          <xsl:attribute name="id">FX-SCH-A-000419</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:PostalTradeAddress' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:URIUniversalCommunication)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:URIUniversalCommunication)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000165</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:URIUniversalCommunication' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:SpecifiedTaxRegistration)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:SpecifiedTaxRegistration)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000166</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:SpecifiedTaxRegistration' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:GlobalID" mode="M51" priority="1117">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:GlobalID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000420</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue5" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue5)=0 or $__bundled_facturx_codes/codedb/cl[@id=5]/enumeration[@value=$codeValue5]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue5)=0 or $__bundled_facturx_codes/codedb/cl[@id=5]/enumeration[@value=$codeValue5]">
          <xsl:attribute name="id">FX-SCH-A-000421</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:ID" mode="M51" priority="1116">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:ID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:PostalTradeAddress" mode="M51" priority="1115">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:PostalTradeAddress" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CountryID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CountryID)=1">
          <xsl:attribute name="id">FX-SCH-A-000422</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CountryID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CountrySubDivisionName)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CountrySubDivisionName)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000167</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CountrySubDivisionName' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CountryID" mode="M51" priority="1114">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CountryID" />
    <xsl:variable name="codeValue7" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue7)=0 or $__bundled_facturx_codes/codedb/cl[@id=7]/enumeration[@value=$codeValue7]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue7)=0 or $__bundled_facturx_codes/codedb/cl[@id=7]/enumeration[@value=$codeValue7]">
          <xsl:attribute name="id">FX-SCH-A-000423</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:CountryID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:SpecifiedLegalOrganization/ram:ID" mode="M51" priority="1113">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:SpecifiedLegalOrganization/ram:ID" />
    <xsl:variable name="codeValue6" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue6)=0 or $__bundled_facturx_codes/codedb/cl[@id=6]/enumeration[@value=$codeValue6]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue6)=0 or $__bundled_facturx_codes/codedb/cl[@id=6]/enumeration[@value=$codeValue6]">
          <xsl:attribute name="id">FX-SCH-A-000424</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:SpecifiedLegalOrganization/ram:TradingBusinessName" mode="M51" priority="1112">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:SpecifiedLegalOrganization/ram:TradingBusinessName" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:TradingBusinessName' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:SpecifiedTaxRegistration" mode="M51" priority="1111">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:SpecifiedTaxRegistration" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)=1">
          <xsl:attribute name="id">FX-SCH-A-000425</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID" mode="M51" priority="1110">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000426</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue9" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue9)=0 or $__bundled_facturx_codes/codedb/cl[@id=9]/enumeration[@value=$codeValue9]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue9)=0 or $__bundled_facturx_codes/codedb/cl[@id=9]/enumeration[@value=$codeValue9]">
          <xsl:attribute name="id">FX-SCH-A-000427</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:URIUniversalCommunication" mode="M51" priority="1109">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:URIUniversalCommunication" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:URIID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:URIID)=1">
          <xsl:attribute name="id">FX-SCH-A-000168</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:URIID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:URIUniversalCommunication/ram:URIID" mode="M51" priority="1108">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:URIUniversalCommunication/ram:URIID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000428</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue8" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue8)=0 or $__bundled_facturx_codes/codedb/cl[@id=8]/enumeration[@value=$codeValue8]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue8)=0 or $__bundled_facturx_codes/codedb/cl[@id=8]/enumeration[@value=$codeValue8]">
          <xsl:attribute name="id">FX-SCH-A-000429</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:ContractReferencedDocument" mode="M51" priority="1107">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:ContractReferencedDocument" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:IssuerAssignedID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:IssuerAssignedID)=1">
          <xsl:attribute name="id">FX-SCH-A-000430</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:IssuerAssignedID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:ContractReferencedDocument/ram:FormattedIssueDateTime" mode="M51" priority="1106">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:ContractReferencedDocument/ram:FormattedIssueDateTime" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:FormattedIssueDateTime' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:ContractReferencedDocument/ram:IssuerAssignedID" mode="M51" priority="1105">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:ContractReferencedDocument/ram:IssuerAssignedID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty" mode="M51" priority="1104">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:Name)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:Name)=1">
          <xsl:attribute name="id">FX-SCH-A-000431</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:Name' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:PostalTradeAddress)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:PostalTradeAddress)=1">
          <xsl:attribute name="id">FX-SCH-A-000432</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:PostalTradeAddress' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:SpecifiedTaxRegistration)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:SpecifiedTaxRegistration)=1">
          <xsl:attribute name="id">FX-SCH-A-000169</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:SpecifiedTaxRegistration' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:GlobalID" mode="M51" priority="1103">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:GlobalID" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:GlobalID' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:ID" mode="M51" priority="1102">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:ID" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:ID' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:PostalTradeAddress" mode="M51" priority="1101">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:PostalTradeAddress" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CountryID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CountryID)=1">
          <xsl:attribute name="id">FX-SCH-A-000433</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CountryID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CountrySubDivisionName)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CountrySubDivisionName)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000434</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CountrySubDivisionName' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:PostalTradeAddress/ram:CountryID" mode="M51" priority="1100">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:PostalTradeAddress/ram:CountryID" />
    <xsl:variable name="codeValue7" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue7)=0 or $__bundled_facturx_codes/codedb/cl[@id=7]/enumeration[@value=$codeValue7]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue7)=0 or $__bundled_facturx_codes/codedb/cl[@id=7]/enumeration[@value=$codeValue7]">
          <xsl:attribute name="id">FX-SCH-A-000435</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:CountryID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedLegalOrganization" mode="M51" priority="1099">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedLegalOrganization" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:SpecifiedLegalOrganization' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration" mode="M51" priority="1098">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)=1">
          <xsl:attribute name="id">FX-SCH-A-000436</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID" mode="M51" priority="1097">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000437</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue10" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue10)=0 or $__bundled_facturx_codes/codedb/cl[@id=10]/enumeration[@value=$codeValue10]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue10)=0 or $__bundled_facturx_codes/codedb/cl[@id=10]/enumeration[@value=$codeValue10]">
          <xsl:attribute name="id">FX-SCH-A-000438</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:URIUniversalCommunication" mode="M51" priority="1096">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTaxRepresentativeTradeParty/ram:URIUniversalCommunication" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:URIUniversalCommunication' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty" mode="M51" priority="1095">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:Name)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:Name)=1">
          <xsl:attribute name="id">FX-SCH-A-000409</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:Name' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:PostalTradeAddress)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:PostalTradeAddress)=1">
          <xsl:attribute name="id">FX-SCH-A-000032</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:PostalTradeAddress' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:URIUniversalCommunication)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:URIUniversalCommunication)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000439</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:URIUniversalCommunication' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;VA&quot;])&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;VA&quot;])&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000033</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element variant 'ram:SpecifiedTaxRegistration[ram:ID/@schemeID="VA"]' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;FC&quot;])&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;FC&quot;])&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000034</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element variant 'ram:SpecifiedTaxRegistration[ram:ID/@schemeID="FC"]' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:GlobalID" mode="M51" priority="1094">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:GlobalID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000440</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue5" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue5)=0 or $__bundled_facturx_codes/codedb/cl[@id=5]/enumeration[@value=$codeValue5]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue5)=0 or $__bundled_facturx_codes/codedb/cl[@id=5]/enumeration[@value=$codeValue5]">
          <xsl:attribute name="id">FX-SCH-A-000441</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:ID" mode="M51" priority="1093">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:ID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:PostalTradeAddress" mode="M51" priority="1092">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:PostalTradeAddress" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CountryID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CountryID)=1">
          <xsl:attribute name="id">FX-SCH-A-000035</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CountryID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CountrySubDivisionName)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CountrySubDivisionName)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000442</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CountrySubDivisionName' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:PostalTradeAddress/ram:CountryID" mode="M51" priority="1091">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:PostalTradeAddress/ram:CountryID" />
    <xsl:variable name="codeValue7" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue7)=0 or $__bundled_facturx_codes/codedb/cl[@id=7]/enumeration[@value=$codeValue7]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue7)=0 or $__bundled_facturx_codes/codedb/cl[@id=7]/enumeration[@value=$codeValue7]">
          <xsl:attribute name="id">FX-SCH-A-000443</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:CountryID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedLegalOrganization/ram:ID" mode="M51" priority="1090">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedLegalOrganization/ram:ID" />
    <xsl:variable name="codeValue6" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue6)=0 or $__bundled_facturx_codes/codedb/cl[@id=6]/enumeration[@value=$codeValue6]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue6)=0 or $__bundled_facturx_codes/codedb/cl[@id=6]/enumeration[@value=$codeValue6]">
          <xsl:attribute name="id">FX-SCH-A-000444</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ not(ram:ID/@schemeID=&quot;VA&quot;) and  not(ram:ID/@schemeID=&quot;FC&quot;)]" mode="M51" priority="1089">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ not(ram:ID/@schemeID=&quot;VA&quot;) and  not(ram:ID/@schemeID=&quot;FC&quot;)]" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element variant 'ram:SpecifiedTaxRegistration[ not(ram:ID/@schemeID="VA") and  not(ram:ID/@schemeID="FC")]' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;FC&quot;]" mode="M51" priority="1088">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;FC&quot;]" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)=1">
          <xsl:attribute name="id">FX-SCH-A-000411</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;FC&quot;]/ram:ID" mode="M51" priority="1087">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;FC&quot;]/ram:ID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000037</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;VA&quot;]" mode="M51" priority="1086">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;VA&quot;]" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)=1">
          <xsl:attribute name="id">FX-SCH-A-000412</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;VA&quot;]/ram:ID" mode="M51" priority="1085">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration[ram:ID/@schemeID=&quot;VA&quot;]/ram:ID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000413</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:URIUniversalCommunication" mode="M51" priority="1084">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:URIUniversalCommunication" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:URIID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:URIID)=1">
          <xsl:attribute name="id">FX-SCH-A-000445</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:URIID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:URIUniversalCommunication/ram:URIID" mode="M51" priority="1083">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:URIUniversalCommunication/ram:URIID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000446</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue8" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue8)=0 or $__bundled_facturx_codes/codedb/cl[@id=8]/enumeration[@value=$codeValue8]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue8)=0 or $__bundled_facturx_codes/codedb/cl[@id=8]/enumeration[@value=$codeValue8]">
          <xsl:attribute name="id">FX-SCH-A-000447</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ActualDeliverySupplyChainEvent" mode="M51" priority="1082">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ActualDeliverySupplyChainEvent" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:OccurrenceDateTime)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:OccurrenceDateTime)=1">
          <xsl:attribute name="id">FX-SCH-A-000171</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:OccurrenceDateTime' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString" mode="M51" priority="1081">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@format" />
      <xsl:otherwise>
        <svrl:failed-assert test="@format">
          <xsl:attribute name="id">FX-SCH-A-000448</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@format' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue3" select="@format" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]">
          <xsl:attribute name="id">FX-SCH-A-000449</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@format' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:DespatchAdviceReferencedDocument" mode="M51" priority="1080">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:DespatchAdviceReferencedDocument" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:IssuerAssignedID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:IssuerAssignedID)=1">
          <xsl:attribute name="id">FX-SCH-A-000450</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:IssuerAssignedID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:DespatchAdviceReferencedDocument/ram:FormattedIssueDateTime" mode="M51" priority="1079">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:DespatchAdviceReferencedDocument/ram:FormattedIssueDateTime" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:FormattedIssueDateTime' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:DespatchAdviceReferencedDocument/ram:IssuerAssignedID" mode="M51" priority="1078">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:DespatchAdviceReferencedDocument/ram:IssuerAssignedID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty" mode="M51" priority="1077">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000451</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:GlobalID)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:GlobalID)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000452</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:GlobalID' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:GlobalID" mode="M51" priority="1076">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:GlobalID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000453</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue5" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue5)=0 or $__bundled_facturx_codes/codedb/cl[@id=5]/enumeration[@value=$codeValue5]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue5)=0 or $__bundled_facturx_codes/codedb/cl[@id=5]/enumeration[@value=$codeValue5]">
          <xsl:attribute name="id">FX-SCH-A-000454</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:ID" mode="M51" priority="1075">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:ID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:PostalTradeAddress" mode="M51" priority="1074">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:PostalTradeAddress" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CountryID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CountryID)=1">
          <xsl:attribute name="id">FX-SCH-A-000455</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CountryID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CountrySubDivisionName)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CountrySubDivisionName)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000456</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CountrySubDivisionName' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:PostalTradeAddress/ram:CountryID" mode="M51" priority="1073">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:PostalTradeAddress/ram:CountryID" />
    <xsl:variable name="codeValue7" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue7)=0 or $__bundled_facturx_codes/codedb/cl[@id=7]/enumeration[@value=$codeValue7]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue7)=0 or $__bundled_facturx_codes/codedb/cl[@id=7]/enumeration[@value=$codeValue7]">
          <xsl:attribute name="id">FX-SCH-A-000457</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:CountryID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:SpecifiedLegalOrganization" mode="M51" priority="1072">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:SpecifiedLegalOrganization" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:SpecifiedLegalOrganization' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:SpecifiedTaxRegistration" mode="M51" priority="1071">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:SpecifiedTaxRegistration" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:SpecifiedTaxRegistration' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:URIUniversalCommunication" mode="M51" priority="1070">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:URIUniversalCommunication" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:URIUniversalCommunication' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement" mode="M51" priority="1069">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:PaymentReference)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:PaymentReference)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000172</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:PaymentReference' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:InvoiceCurrencyCode)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:InvoiceCurrencyCode)=1">
          <xsl:attribute name="id">FX-SCH-A-000038</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:InvoiceCurrencyCode' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ApplicableTradeTax)>=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ApplicableTradeTax)>=1">
          <xsl:attribute name="id">FX-SCH-A-000173</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ApplicableTradeTax' must occur at least 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:SpecifiedTradePaymentTerms)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:SpecifiedTradePaymentTerms)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000174</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:SpecifiedTradePaymentTerms' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:SpecifiedTradeSettlementHeaderMonetarySummation)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:SpecifiedTradeSettlementHeaderMonetarySummation)=1">
          <xsl:attribute name="id">FX-SCH-A-000039</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:SpecifiedTradeSettlementHeaderMonetarySummation' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ReceivableSpecifiedTradeAccountingAccount)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ReceivableSpecifiedTradeAccountingAccount)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000175</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ReceivableSpecifiedTradeAccountingAccount' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax" mode="M51" priority="1068">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CalculatedAmount)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CalculatedAmount)=1">
          <xsl:attribute name="id">FX-SCH-A-000176</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CalculatedAmount' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:TypeCode)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:TypeCode)=1">
          <xsl:attribute name="id">FX-SCH-A-000458</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:TypeCode' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:BasisAmount)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:BasisAmount)=1">
          <xsl:attribute name="id">FX-SCH-A-000177</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:BasisAmount' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CategoryCode)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CategoryCode)=1">
          <xsl:attribute name="id">FX-SCH-A-000178</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CategoryCode' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:BasisAmount" mode="M51" priority="1067">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:BasisAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CalculatedAmount" mode="M51" priority="1066">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CalculatedAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode" mode="M51" priority="1065">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode" />
    <xsl:variable name="codeValue14" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue14)=0 or $__bundled_facturx_codes/codedb/cl[@id=14]/enumeration[@value=$codeValue14]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue14)=0 or $__bundled_facturx_codes/codedb/cl[@id=14]/enumeration[@value=$codeValue14]">
          <xsl:attribute name="id">FX-SCH-A-000179</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:CategoryCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:DueDateTypeCode" mode="M51" priority="1064">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:DueDateTypeCode" />
    <xsl:variable name="codeValue16" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue16)=0 or $__bundled_facturx_codes/codedb/cl[@id=16]/enumeration[@value=$codeValue16]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue16)=0 or $__bundled_facturx_codes/codedb/cl[@id=16]/enumeration[@value=$codeValue16]">
          <xsl:attribute name="id">FX-SCH-A-000180</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:DueDateTypeCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:ExemptionReasonCode" mode="M51" priority="1063">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:ExemptionReasonCode" />
    <xsl:variable name="codeValue15" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue15)=0 or $__bundled_facturx_codes/codedb/cl[@id=15]/enumeration[@value=$codeValue15]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue15)=0 or $__bundled_facturx_codes/codedb/cl[@id=15]/enumeration[@value=$codeValue15]">
          <xsl:attribute name="id">FX-SCH-A-000181</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:ExemptionReasonCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:TypeCode" mode="M51" priority="1062">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:TypeCode" />
    <xsl:variable name="codeValue13" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue13)=0 or $__bundled_facturx_codes/codedb/cl[@id=13]/enumeration[@value=$codeValue13]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue13)=0 or $__bundled_facturx_codes/codedb/cl[@id=13]/enumeration[@value=$codeValue13]">
          <xsl:attribute name="id">FX-SCH-A-000459</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:TypeCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:BillingSpecifiedPeriod/ram:EndDateTime/udt:DateTimeString" mode="M51" priority="1061">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:BillingSpecifiedPeriod/ram:EndDateTime/udt:DateTimeString" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@format" />
      <xsl:otherwise>
        <svrl:failed-assert test="@format">
          <xsl:attribute name="id">FX-SCH-A-000460</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@format' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue3" select="@format" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]">
          <xsl:attribute name="id">FX-SCH-A-000461</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@format' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:BillingSpecifiedPeriod/ram:StartDateTime/udt:DateTimeString" mode="M51" priority="1060">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:BillingSpecifiedPeriod/ram:StartDateTime/udt:DateTimeString" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@format" />
      <xsl:otherwise>
        <svrl:failed-assert test="@format">
          <xsl:attribute name="id">FX-SCH-A-000462</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@format' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue3" select="@format" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]">
          <xsl:attribute name="id">FX-SCH-A-000463</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@format' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:CreditorReferenceID" mode="M51" priority="1059">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:CreditorReferenceID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode" mode="M51" priority="1058">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode" />
    <xsl:variable name="codeValue11" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue11)=0 or $__bundled_facturx_codes/codedb/cl[@id=11]/enumeration[@value=$codeValue11]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue11)=0 or $__bundled_facturx_codes/codedb/cl[@id=11]/enumeration[@value=$codeValue11]">
          <xsl:attribute name="id">FX-SCH-A-000464</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:InvoiceCurrencyCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString" mode="M51" priority="1057">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@format" />
      <xsl:otherwise>
        <svrl:failed-assert test="@format">
          <xsl:attribute name="id">FX-SCH-A-000465</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@format' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue21" select="@format" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue21)=0 or $__bundled_facturx_codes/codedb/cl[@id=21]/enumeration[@value=$codeValue21]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue21)=0 or $__bundled_facturx_codes/codedb/cl[@id=21]/enumeration[@value=$codeValue21]">
          <xsl:attribute name="id">FX-SCH-A-000466</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@format' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceReferencedDocument/ram:IssuerAssignedID" mode="M51" priority="1056">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceReferencedDocument/ram:IssuerAssignedID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty" mode="M51" priority="1055">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ID)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ID)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000467</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ID' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:GlobalID)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:GlobalID)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000468</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:GlobalID' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:Name)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:Name)=1">
          <xsl:attribute name="id">FX-SCH-A-000469</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:Name' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:GlobalID" mode="M51" priority="1054">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:GlobalID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@schemeID" />
      <xsl:otherwise>
        <svrl:failed-assert test="@schemeID">
          <xsl:attribute name="id">FX-SCH-A-000470</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@schemeID' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue5" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue5)=0 or $__bundled_facturx_codes/codedb/cl[@id=5]/enumeration[@value=$codeValue5]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue5)=0 or $__bundled_facturx_codes/codedb/cl[@id=5]/enumeration[@value=$codeValue5]">
          <xsl:attribute name="id">FX-SCH-A-000471</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:ID" mode="M51" priority="1053">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:ID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:PostalTradeAddress" mode="M51" priority="1052">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:PostalTradeAddress" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:PostalTradeAddress' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:SpecifiedLegalOrganization/ram:ID" mode="M51" priority="1051">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:SpecifiedLegalOrganization/ram:ID" />
    <xsl:variable name="codeValue6" select="@schemeID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue6)=0 or $__bundled_facturx_codes/codedb/cl[@id=6]/enumeration[@value=$codeValue6]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue6)=0 or $__bundled_facturx_codes/codedb/cl[@id=6]/enumeration[@value=$codeValue6]">
          <xsl:attribute name="id">FX-SCH-A-000472</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@schemeID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:SpecifiedLegalOrganization/ram:TradingBusinessName" mode="M51" priority="1050">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:SpecifiedLegalOrganization/ram:TradingBusinessName" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:TradingBusinessName' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:SpecifiedTaxRegistration" mode="M51" priority="1049">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:SpecifiedTaxRegistration" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:SpecifiedTaxRegistration' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:URIUniversalCommunication" mode="M51" priority="1048">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:PayeeTradeParty/ram:URIUniversalCommunication" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:URIUniversalCommunication' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID" mode="M51" priority="1047">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ not(ram:ChargeIndicator/udt:Indicator=&quot;false&quot;) and  not(ram:ChargeIndicator/udt:Indicator=&quot;true&quot;)]" mode="M51" priority="1046">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ not(ram:ChargeIndicator/udt:Indicator=&quot;false&quot;) and  not(ram:ChargeIndicator/udt:Indicator=&quot;true&quot;)]" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element variant 'ram:SpecifiedTradeAllowanceCharge[ not(ram:ChargeIndicator/udt:Indicator="false") and  not(ram:ChargeIndicator/udt:Indicator="true")]' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]" mode="M51" priority="1045">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ChargeIndicator)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ChargeIndicator)=1">
          <xsl:attribute name="id">FX-SCH-A-000183</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ChargeIndicator' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ActualAmount)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ActualAmount)=1">
          <xsl:attribute name="id">FX-SCH-A-000184</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ActualAmount' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CategoryTradeTax)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CategoryTradeTax)=1">
          <xsl:attribute name="id">FX-SCH-A-000185</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CategoryTradeTax' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:ActualAmount" mode="M51" priority="1044">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:ActualAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:BasisAmount" mode="M51" priority="1043">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:BasisAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax" mode="M51" priority="1042">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:TypeCode)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:TypeCode)=1">
          <xsl:attribute name="id">FX-SCH-A-000473</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:TypeCode' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CategoryCode)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CategoryCode)=1">
          <xsl:attribute name="id">FX-SCH-A-000474</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CategoryCode' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:BasisAmount" mode="M51" priority="1041">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:BasisAmount" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:BasisAmount' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:CalculatedAmount" mode="M51" priority="1040">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:CalculatedAmount" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:CalculatedAmount' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:CategoryCode" mode="M51" priority="1039">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:CategoryCode" />
    <xsl:variable name="codeValue14" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue14)=0 or $__bundled_facturx_codes/codedb/cl[@id=14]/enumeration[@value=$codeValue14]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue14)=0 or $__bundled_facturx_codes/codedb/cl[@id=14]/enumeration[@value=$codeValue14]">
          <xsl:attribute name="id">FX-SCH-A-000475</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:CategoryCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:DueDateTypeCode" mode="M51" priority="1038">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:DueDateTypeCode" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:DueDateTypeCode' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:ExemptionReason" mode="M51" priority="1037">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:ExemptionReason" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:ExemptionReason' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:ExemptionReasonCode" mode="M51" priority="1036">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:ExemptionReasonCode" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:ExemptionReasonCode' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:TypeCode" mode="M51" priority="1035">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:CategoryTradeTax/ram:TypeCode" />
    <xsl:variable name="codeValue13" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue13)=0 or $__bundled_facturx_codes/codedb/cl[@id=13]/enumeration[@value=$codeValue13]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue13)=0 or $__bundled_facturx_codes/codedb/cl[@id=13]/enumeration[@value=$codeValue13]">
          <xsl:attribute name="id">FX-SCH-A-000476</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:TypeCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:ReasonCode" mode="M51" priority="1034">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;false&quot;]/ram:ReasonCode" />
    <xsl:variable name="codeValue17" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue17)=0 or $__bundled_facturx_codes/codedb/cl[@id=17]/enumeration[@value=$codeValue17]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue17)=0 or $__bundled_facturx_codes/codedb/cl[@id=17]/enumeration[@value=$codeValue17]">
          <xsl:attribute name="id">FX-SCH-A-000186</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:ReasonCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]" mode="M51" priority="1033">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ChargeIndicator)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ChargeIndicator)=1">
          <xsl:attribute name="id">FX-SCH-A-000477</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ChargeIndicator' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ActualAmount)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ActualAmount)=1">
          <xsl:attribute name="id">FX-SCH-A-000478</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ActualAmount' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CategoryTradeTax)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CategoryTradeTax)=1">
          <xsl:attribute name="id">FX-SCH-A-000479</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CategoryTradeTax' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:ActualAmount" mode="M51" priority="1032">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:ActualAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:BasisAmount" mode="M51" priority="1031">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:BasisAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax" mode="M51" priority="1030">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:TypeCode)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:TypeCode)=1">
          <xsl:attribute name="id">FX-SCH-A-000480</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:TypeCode' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:CategoryCode)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:CategoryCode)=1">
          <xsl:attribute name="id">FX-SCH-A-000481</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:CategoryCode' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:BasisAmount" mode="M51" priority="1029">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:BasisAmount" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:BasisAmount' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:CalculatedAmount" mode="M51" priority="1028">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:CalculatedAmount" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:CalculatedAmount' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:CategoryCode" mode="M51" priority="1027">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:CategoryCode" />
    <xsl:variable name="codeValue14" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue14)=0 or $__bundled_facturx_codes/codedb/cl[@id=14]/enumeration[@value=$codeValue14]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue14)=0 or $__bundled_facturx_codes/codedb/cl[@id=14]/enumeration[@value=$codeValue14]">
          <xsl:attribute name="id">FX-SCH-A-000482</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:CategoryCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:DueDateTypeCode" mode="M51" priority="1026">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:DueDateTypeCode" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:DueDateTypeCode' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:ExemptionReason" mode="M51" priority="1025">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:ExemptionReason" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:ExemptionReason' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:ExemptionReasonCode" mode="M51" priority="1024">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:ExemptionReasonCode" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element 'ram:ExemptionReasonCode' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:TypeCode" mode="M51" priority="1023">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:CategoryTradeTax/ram:TypeCode" />
    <xsl:variable name="codeValue13" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue13)=0 or $__bundled_facturx_codes/codedb/cl[@id=13]/enumeration[@value=$codeValue13]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue13)=0 or $__bundled_facturx_codes/codedb/cl[@id=13]/enumeration[@value=$codeValue13]">
          <xsl:attribute name="id">FX-SCH-A-000483</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:TypeCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:ReasonCode[ not(not (@listID)) and  not(@listID=&quot;5153&quot;)]" mode="M51" priority="1022">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:ReasonCode[ not(not (@listID)) and  not(@listID=&quot;5153&quot;)]" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element variant 'ram:ReasonCode[ not(not (@listID)) and  not(@listID="5153")]' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:ReasonCode[not (@listID)]" mode="M51" priority="1021">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator=&quot;true&quot;]/ram:ReasonCode[not (@listID)]" />
    <xsl:variable name="codeValue18" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue18)=0 or $__bundled_facturx_codes/codedb/cl[@id=18]/enumeration[@value=$codeValue18]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue18)=0 or $__bundled_facturx_codes/codedb/cl[@id=18]/enumeration[@value=$codeValue18]">
          <xsl:attribute name="id">FX-SCH-A-000391</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:ReasonCode[not (@listID)]' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms" mode="M51" priority="1020">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:Description)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:Description)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000187</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:Description' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:DirectDebitMandateID)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:DirectDebitMandateID)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000188</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:DirectDebitMandateID' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms/ram:DirectDebitMandateID" mode="M51" priority="1019">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms/ram:DirectDebitMandateID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime/udt:DateTimeString" mode="M51" priority="1018">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime/udt:DateTimeString" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="@format" />
      <xsl:otherwise>
        <svrl:failed-assert test="@format">
          <xsl:attribute name="id">FX-SCH-A-000484</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Attribute '@format' is required in this context.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:variable name="codeValue3" select="@format" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue3)=0 or $__bundled_facturx_codes/codedb/cl[@id=3]/enumeration[@value=$codeValue3]">
          <xsl:attribute name="id">FX-SCH-A-000485</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@format' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation" mode="M51" priority="1017">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:LineTotalAmount)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:LineTotalAmount)=1">
          <xsl:attribute name="id">FX-SCH-A-000189</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:LineTotalAmount' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:ChargeTotalAmount)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:ChargeTotalAmount)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000190</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:ChargeTotalAmount' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:AllowanceTotalAmount)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:AllowanceTotalAmount)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000191</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:AllowanceTotalAmount' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:TaxBasisTotalAmount)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:TaxBasisTotalAmount)=1">
          <xsl:attribute name="id">FX-SCH-A-000041</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:TaxBasisTotalAmount' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:TaxTotalAmount[@currencyID=../../ram:InvoiceCurrencyCode])&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:TaxTotalAmount[@currencyID=../../ram:InvoiceCurrencyCode])&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000042</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element variant 'ram:TaxTotalAmount[@currencyID=../../ram:InvoiceCurrencyCode]' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:TaxTotalAmount[@currencyID=../../ram:TaxCurrencyCode])&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:TaxTotalAmount[@currencyID=../../ram:TaxCurrencyCode])&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000192</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element variant 'ram:TaxTotalAmount[@currencyID=../../ram:TaxCurrencyCode]' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:GrandTotalAmount)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:GrandTotalAmount)=1">
          <xsl:attribute name="id">FX-SCH-A-000043</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:GrandTotalAmount' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:TotalPrepaidAmount)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:TotalPrepaidAmount)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000193</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:TotalPrepaidAmount' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:DuePayableAmount)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:DuePayableAmount)=1">
          <xsl:attribute name="id">FX-SCH-A-000044</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:DuePayableAmount' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:AllowanceTotalAmount" mode="M51" priority="1016">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:AllowanceTotalAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:ChargeTotalAmount" mode="M51" priority="1015">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:ChargeTotalAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:DuePayableAmount" mode="M51" priority="1014">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:DuePayableAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:GrandTotalAmount" mode="M51" priority="1013">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:GrandTotalAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:LineTotalAmount" mode="M51" priority="1012">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:LineTotalAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxBasisTotalAmount" mode="M51" priority="1011">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxBasisTotalAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[ not(@currencyID=../../ram:InvoiceCurrencyCode) and  not(@currencyID=../../ram:TaxCurrencyCode)]" mode="M51" priority="1010">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[ not(@currencyID=../../ram:InvoiceCurrencyCode) and  not(@currencyID=../../ram:TaxCurrencyCode)]" />

		<!--REPORT -->
<xsl:if test="true()">
      <svrl:successful-report test="true()">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Element variant 'ram:TaxTotalAmount[ not(@currencyID=../../ram:InvoiceCurrencyCode) and  not(@currencyID=../../ram:TaxCurrencyCode)]' is marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID=../../ram:InvoiceCurrencyCode]" mode="M51" priority="1009">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID=../../ram:InvoiceCurrencyCode]" />
    <xsl:variable name="codeValue19" select="@currencyID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue19)=0 or $__bundled_facturx_codes/codedb/cl[@id=19]/enumeration[@value=$codeValue19]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue19)=0 or $__bundled_facturx_codes/codedb/cl[@id=19]/enumeration[@value=$codeValue19]">
          <xsl:attribute name="id">FX-SCH-A-000486</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@currencyID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID=../../ram:TaxCurrencyCode]" mode="M51" priority="1008">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[@currencyID=../../ram:TaxCurrencyCode]" />
    <xsl:variable name="codeValue20" select="@currencyID" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue20)=0 or $__bundled_facturx_codes/codedb/cl[@id=20]/enumeration[@value=$codeValue20]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue20)=0 or $__bundled_facturx_codes/codedb/cl[@id=20]/enumeration[@value=$codeValue20]">
          <xsl:attribute name="id">FX-SCH-A-000487</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of '@currencyID' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TotalPrepaidAmount" mode="M51" priority="1007">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TotalPrepaidAmount" />

		<!--REPORT -->
<xsl:if test="@currencyID">
      <svrl:successful-report test="@currencyID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @currencyID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans" mode="M51" priority="1006">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:TypeCode)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:TypeCode)=1">
          <xsl:attribute name="id">FX-SCH-A-000488</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:TypeCode' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:PayeePartyCreditorFinancialAccount)&lt;=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:PayeePartyCreditorFinancialAccount)&lt;=1">
          <xsl:attribute name="id">FX-SCH-A-000194</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:PayeePartyCreditorFinancialAccount' may occur at maximum 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeePartyCreditorFinancialAccount/ram:IBANID" mode="M51" priority="1005">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeePartyCreditorFinancialAccount/ram:IBANID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeePartyCreditorFinancialAccount/ram:ProprietaryID" mode="M51" priority="1004">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeePartyCreditorFinancialAccount/ram:ProprietaryID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerPartyDebtorFinancialAccount" mode="M51" priority="1003">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerPartyDebtorFinancialAccount" />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="count(ram:IBANID)=1" />
      <xsl:otherwise>
        <svrl:failed-assert test="count(ram:IBANID)=1">
          <xsl:attribute name="id">FX-SCH-A-000195</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Element 'ram:IBANID' must occur exactly 1 times.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerPartyDebtorFinancialAccount/ram:IBANID" mode="M51" priority="1002">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerPartyDebtorFinancialAccount/ram:IBANID" />

		<!--REPORT -->
<xsl:if test="@schemeID">
      <svrl:successful-report test="@schemeID">
        <xsl:attribute name="location">
          <xsl:apply-templates mode="schematron-select-full-path" select="." />
        </xsl:attribute>
        <svrl:text>
	Attribute @schemeID' marked as not used in the given context.</svrl:text>
      </svrl:successful-report>
    </xsl:if>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode" mode="M51" priority="1001">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode" />
    <xsl:variable name="codeValue12" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue12)=0 or $__bundled_facturx_codes/codedb/cl[@id=12]/enumeration[@value=$codeValue12]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue12)=0 or $__bundled_facturx_codes/codedb/cl[@id=12]/enumeration[@value=$codeValue12]">
          <xsl:attribute name="id">FX-SCH-A-000489</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:TypeCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>

	<!--RULE -->
<xsl:template match="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode" mode="M51" priority="1000">
    <svrl:fired-rule context="/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:TaxCurrencyCode" />
    <xsl:variable name="codeValue11" select="." />

		<!--ASSERT -->
<xsl:choose>
      <xsl:when test="string-length($codeValue11)=0 or $__bundled_facturx_codes/codedb/cl[@id=11]/enumeration[@value=$codeValue11]" />
      <xsl:otherwise>
        <svrl:failed-assert test="string-length($codeValue11)=0 or $__bundled_facturx_codes/codedb/cl[@id=11]/enumeration[@value=$codeValue11]">
          <xsl:attribute name="id">FX-SCH-A-000196</xsl:attribute>
          <xsl:attribute name="location">
            <xsl:apply-templates mode="schematron-select-full-path" select="." />
          </xsl:attribute>
          <svrl:text>
	Value of 'ram:TaxCurrencyCode' is not allowed.</svrl:text>
        </svrl:failed-assert>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>
  <xsl:template match="text()" mode="M51" priority="-1" />
  <xsl:template match="@*|node()" mode="M51" priority="-2">
    <xsl:apply-templates mode="M51" select="@*|*" />
  </xsl:template>
</xsl:stylesheet>
