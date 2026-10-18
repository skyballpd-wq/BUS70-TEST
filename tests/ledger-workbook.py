"""Independent OOXML/ZIP validation: synthetic data only."""
from zipfile import ZipFile
from xml.etree import ElementTree as E
p="/tmp/bus70-ledger-synthetic.xlsx"
ns={"s":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with ZipFile(p) as z:
    assert z.testzip() is None
    for name in z.namelist(): E.fromstring(z.read(name))
    sheet=E.fromstring(z.read("xl/worksheets/sheet1.xml"))
    styles=E.fromstring(z.read("xl/styles.xml"))
    cells={c.attrib["r"]:c for c in sheet.findall(".//s:c",ns)}
    text=lambda ref: "".join(cells[ref].itertext())
    assert text("O2")=="" and text("I2")=="" and text("L2")==""
    assert text("O3")=="다음날 00:01:05" and cells["O3"].attrib["s"]=="2"
    assert text("R3")=="다음날 00:21:00" and cells["R3"].attrib["s"]=="2"
    assert text("B3")=="=시험<&기사" and not sheet.findall(".//s:f",ns)
    assert styles.find("s:fonts",ns)[2].find("s:color",ns).attrib["rgb"]=="FFB91C1C"
    assert sheet.find("s:autoFilter",ns).attrib["ref"]=="A1:R3"
print("XLSX: ZIP CRC, all XML, empty actuals, escaped literal text, next-day and red arrival/return styles passed.")
