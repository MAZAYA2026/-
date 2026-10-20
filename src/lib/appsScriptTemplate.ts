// Comprehensive Google Apps Script template for Mazaya Office integration with Google Sheets
export const APPS_SCRIPT_CODE = `// سكربت الربط التلقائي وقاعدة البيانات الشاملة لمكتب مزايا مع جوجل شيت
function doPost(e) {
  try {
    var contents = {};
    if (e && e.postData && e.postData.contents) {
      try {
        contents = JSON.parse(e.postData.contents);
      } catch(parseErr) {
        contents = { action: "push" };
      }
    }
    
    var action = contents.action || "push";
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 0. Test Connection
    if (action === "test") {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم الاتصال بنجاح بملف جوجل شيت وقاعدة البيانات جاهزة ومستعدة للتخزين! 📊" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Push / Sync All Data
    if (action === "push" || action === "sync") {
      var db = contents.db || contents;

      // --- Sheet 1: Invoices_الفواتير ---
      if (db.invoices && Array.isArray(db.invoices)) {
        var invSheet = getOrCreateSheet(ss, "Invoices_الفواتير");
        invSheet.clearContents();
        var invHeaders = [
          "رقم الفاتورة", "التاريخ", "الحالة", "الموظف", "مكان الحفظ (رقم الدرج)", 
          "رسوم حكومية", "رسوم مكتب", "الإجمالي الكلي", "أسماء العملاء", "أرقام الهواتف", 
          "الخدمات المطلوبة", "تفاصيل العملاء كاملة (JSON)"
        ];
        var invRows = [invHeaders];
        for (var i = 0; i < db.invoices.length; i++) {
          var inv = db.invoices[i];
          var custNames = [];
          var custPhones = [];
          var servicesList = [];
          if (inv.customers && Array.isArray(inv.customers)) {
            for (var k = 0; k < inv.customers.length; k++) {
              var c = inv.customers[k];
              custNames.push(c.arabicName + (c.englishName ? " (" + c.englishName + ")" : ""));
              if (c.phone) custPhones.push(c.phone);
              if (c.services && Array.isArray(c.services)) {
                for (var sIdx = 0; sIdx < c.services.length; sIdx++) {
                  var srvObj = c.services[sIdx];
                  var srvTxt = srvObj.serviceId + " x" + (srvObj.quantity || 1);
                  if (srvObj.fineName || (srvObj.fineAmount && srvObj.fineAmount > 0)) {
                    var fDisplay = srvObj.fineName ? (srvObj.fineName.indexOf("غرامة") === 0 ? srvObj.fineName : "غرامة " + srvObj.fineName) : "غرامة حكومية";
                    srvTxt += " [" + fDisplay + " +" + (srvObj.fineAmount || 0) + " ج.م]";
                  }
                  servicesList.push(srvTxt);
                }
              }
            }
          }
          invRows.push([
            inv.invoiceId || "",
            inv.date || "",
            inv.status || "",
            inv.employeeName || "",
            inv.archiveDrawer || "",
            inv.totalGov || 0,
            inv.totalOffice || 0,
            inv.totalAmount || 0,
            custNames.join(" | "),
            custPhones.join(" | "),
            servicesList.join(" , "),
            JSON.stringify(inv.customers || [])
          ]);
        }
        if (invRows.length > 0) {
          invSheet.getRange(1, 1, invRows.length, invRows[0].length).setValues(invRows);
          formatHeader(invSheet, invHeaders.length);
        }
      }

      // --- Sheet 2: Services_الخدمات_والاسعار ---
      if (db.services && Array.isArray(db.services)) {
        var srvSheet = getOrCreateSheet(ss, "Services_الخدمات_والاسعار");
        srvSheet.clearContents();
        var srvHeaders = ["الترتيب", "المعرف ID", "اسم الخدمة", "السعر الحكومي", "رسوم المكتب", "إجمالي السعر", "مدة التنفيذ", "تعليمات التسليم", "إزاحة أيام التسليم", "ملاحظات للعميل"];
        var srvRows = [srvHeaders];
        for (var s = 0; s < db.services.length; s++) {
          var srv = db.services[s];
          srvRows.push([
            srv.order || (s + 1),
            srv.id || "",
            srv.name || "",
            srv.govPrice || 0,
            srv.officeFee || 0,
            (Number(srv.govPrice) || 0) + (Number(srv.officeFee) || 0),
            srv.duration || "",
            srv.instructions || "",
            srv.deliveryDaysOffset || 0,
            srv.notes || ""
          ]);
        }
        if (srvRows.length > 0) {
          srvSheet.getRange(1, 1, srvRows.length, srvRows[0].length).setValues(srvRows);
          formatHeader(srvSheet, srvHeaders.length);
        }
      }

      // --- Sheet 3: Closings_تقفيل_الخزينة ---
      if (db.collectionClosings && Array.isArray(db.collectionClosings)) {
        var clsSheet = getOrCreateSheet(ss, "Closings_تقفيل_الخزينة");
        clsSheet.clearContents();
        var clsHeaders = ["المعرف ID", "تاريخ الإغلاق", "تم الإغلاق بواسطة", "الإيراد الكلي", "صافي أرباح المكتب", "المبلغ النقدي المحصل", "المبلغ الآجل", "ملاحظات"];
        var clsRows = [clsHeaders];
        for (var c = 0; c < db.collectionClosings.length; c++) {
          var cls = db.collectionClosings[c];
          clsRows.push([
            cls.id || "",
            cls.closeDate || "",
            cls.closedBy || "",
            cls.totalRevenue || 0,
            cls.totalOfficeProfit || 0,
            cls.cashCollected || 0,
            cls.deferredAmount || 0,
            cls.notes || ""
          ]);
        }
        if (clsRows.length > 0) {
          clsSheet.getRange(1, 1, clsRows.length, clsRows[0].length).setValues(clsRows);
          formatHeader(clsSheet, clsHeaders.length);
        }
      }

      // --- Sheet 4: Settings_الاعدادات_والرسائل ---
      if (db.settings) {
        var stSheet = getOrCreateSheet(ss, "Settings_الاعدادات_والرسائل");
        stSheet.clearContents();
        var stHeaders = ["بند الإعداد (Setting Name)", "القيمة المحفوظة (Value)", "المعرف البرمجي (Key)"];
        var stRows = [
          stHeaders,
          ["اسم وبيانات المكتب بالترويسة", db.settings.headerText || "", "headerText"],
          ["الترويسة الفرعية", db.settings.subHeaderText || "", "subHeaderText"],
          ["رسالة الترحيب واستلام الطلب", db.settings.welcomeMessage || "", "welcomeMessage"],
          ["قالب رسالة جاهزية الأوراق للاستلام (العامة)", db.settings.readyMessage || "", "readyMessage"],
          ["قالب رسالة جاهزية جوازات السفر (#)", db.settings.readyPassportMessage || "", "readyPassportMessage"],
          ["قالب رسالة الإنجاز الجزئي للخدمات", db.settings.partialReadyMessage || "", "partialReadyMessage"],
          ["قالب رسالة تم التسليم بنجاح", db.settings.deliveryMessage || "", "deliveryMessage"],
          ["تذييل الفاتورة المطبوعة", db.settings.footerText || "", "footerText"],
          ["إعدادات النظام كاملة (JSON)", JSON.stringify(db.settings || {}), "settings_json"]
        ];
        stSheet.getRange(1, 1, stRows.length, stRows[0].length).setValues(stRows);
        formatHeader(stSheet, stHeaders.length);
        try {
          stSheet.setColumnWidth(1, 240);
          stSheet.setColumnWidth(2, 450);
          stSheet.setColumnWidth(3, 160);
        } catch(cwErr) {}
      }

      // --- Sheet 5: Dictionary_قاموس_الاسماء ---
      var dictData = db.dictionary || contents.dictionary;
      if (dictData && Array.isArray(dictData)) {
        var dictSheet = ss.getSheetByName("Dictionary_قاموس_الاسماء") || 
                        ss.getSheetByName("Dictionary") || 
                        ss.getSheetByName("قاموس_الاسماء") || 
                        ss.insertSheet("Dictionary_قاموس_الاسماء");
        dictSheet.clearContents();
        var dictHeaders = ["م", "الاسم بالعربي", "الاسم بالإنجليزي (معايير الجوازات)"];
        var dictRows = [dictHeaders];
        for (var d = 0; d < dictData.length; d++) {
          dictRows.push([
            d + 1,
            dictData[d].arabic || "", 
            dictData[d].english || ""
          ]);
        }
        if (dictRows.length > 0) {
          dictSheet.getRange(1, 1, dictRows.length, dictRows[0].length).setValues(dictRows);
          formatHeader(dictSheet, dictHeaders.length);
          try {
            dictSheet.setColumnWidth(1, 60);
            dictSheet.setColumnWidth(2, 220);
            dictSheet.setColumnWidth(3, 260);
          } catch(cwErr) {}
        }
      }

      // --- Sheet 6: GovernmentFines_الغرامات_الحكومية ---
      var finesData = db.governmentFines || contents.governmentFines;
      if (finesData && Array.isArray(finesData)) {
        var fineSheet = getOrCreateSheet(ss, "GovernmentFines_الغرامات_الحكومية");
        fineSheet.clearContents();
        var fineHeaders = ["المعرف ID", "اسم بند الغرامة الحكومية", "المبلغ الافتراضي (ج.م)", "شروط وملاحظات التطبيق"];
        var fineRows = [fineHeaders];
        for (var f = 0; f < finesData.length; f++) {
          fineRows.push([
            finesData[f].id || ("fine-" + (f + 1)),
            finesData[f].name || "",
            Number(finesData[f].amount) || 0,
            finesData[f].notes || ""
          ]);
        }
        if (fineRows.length > 0) {
          fineSheet.getRange(1, 1, fineRows.length, fineRows[0].length).setValues(fineRows);
          formatHeader(fineSheet, fineHeaders.length);
          try {
            fineSheet.setColumnWidth(1, 100);
            fineSheet.setColumnWidth(2, 250);
            fineSheet.setColumnWidth(3, 160);
            fineSheet.setColumnWidth(4, 350);
          } catch(cwErr) {}
        }
      }

      // --- Sheet 7: Aman_كشف_حركة_الخدمات_الجماهيرية ---
      var amanSheet = findOrCreateSheet(ss, ["Aman_كشف_حركة_الخدمات_الجماهيرية", "Aman", "كشف_امان", "كشف امان", "كشف أمان", "أمان", "امان"], "Aman_كشف_حركة_الخدمات_الجماهيرية");
      amanSheet.clearContents();
      var amanHeaders = ["م", "الاسم", "تاريخ الميلاد", "الملاحظات (النوع والغرامة)", "رقم الفاتورة", "التاريخ"];
      var amanRows = [amanHeaders];
      var rawAmanInput = contents.amanRows || contents.amanReport || (contents.db && (contents.db.amanReport || contents.db.amanRows)) || [];
      if (Array.isArray(rawAmanInput) && rawAmanInput.length > 0) {
        for (var ar = 0; ar < rawAmanInput.length; ar++) {
          var aItem = rawAmanInput[ar];
          if (aItem && (aItem.arabicName || aItem.birthDate || aItem.notes)) {
            amanRows.push([
              amanRows.length,
              aItem.arabicName || "",
              formatSheetDate(aItem.birthDate),
              aItem.notes || "",
              aItem.invoiceId || "",
              formatSheetDate(aItem.date)
            ]);
          }
        }
      } else if (db.invoices && Array.isArray(db.invoices)) {
        var aCounter = 1;
        for (var ai = 0; ai < db.invoices.length; ai++) {
          var aInv = db.invoices[ai];
          if (aInv.customers && Array.isArray(aInv.customers)) {
            for (var ac = 0; ac < aInv.customers.length; ac++) {
              var aCust = aInv.customers[ac];
              var isAman = false;
              var aNote = "";
              if (aCust.services && Array.isArray(aCust.services)) {
                for (var asIdx = 0; asIdx < aCust.services.length; asIdx++) {
                  var sId = String(aCust.services[asIdx].serviceId || "");
                  if (sId.indexOf("#") === 0 && sId.indexOf("##") !== 0) {
                    isAman = true;
                    var sType = (sId.indexOf("مستعجل") !== -1 || sId.indexOf("عاجل") !== -1 || sId.indexOf("فورى") !== -1) ? "مستعجل" : "عادي";
                    var fName = String(aCust.services[asIdx].fineName || "").trim();
                    var fAmt = Number(aCust.services[asIdx].fineAmount) || 0;
                    var finePart = (fName || fAmt > 0) ? (" - " + (fName ? (fName.indexOf("غرامة") === 0 ? fName : "غرامة " + fName) : "غرامة حكومية")) : "";
                    aNote = sType + finePart;
                    break;
                  }
                }
              }
              if (isAman) {
                amanRows.push([
                  aCounter++,
                  aCust.arabicName || "",
                  formatSheetDate(aCust.birthDate),
                  aNote || "",
                  aInv.invoiceId || "",
                  formatSheetDate(aInv.date)
                ]);
              }
            }
          }
        }
      }
      amanSheet.getRange(1, 1, amanRows.length, amanHeaders.length).setValues(amanRows);
      formatHeader(amanSheet, amanHeaders.length);
      try {
        amanSheet.setColumnWidth(1, 60);
        amanSheet.setColumnWidth(2, 280);
        amanSheet.setColumnWidth(3, 140);
        amanSheet.setColumnWidth(4, 250);
        amanSheet.setColumnWidth(5, 110);
        amanSheet.setColumnWidth(6, 120);
      } catch(cwErr) {}

      // --- Sheet 8: الأسماء المرحلة ---
      var postRowsList = contents.postponedRows || contents.amanPostponedRows || (contents.db && (contents.db.amanPostponedRows || contents.db.postponedRows)) || [];
      if (Array.isArray(postRowsList)) {
        var postSheet = findOrCreateSheet(ss, ["الأسماء المرحلة", "الاسماء المرحلة", "الأسماء_المرحلة", "الاسماء_المرحلة", "Aman_Postponed_الأسماء_المرحلة", "Aman_Postponed", "المؤجلين", "المرحلين"], "الأسماء_المرحلة");
        postSheet.clearContents();
        var postHeaders = ["م", "الاسم", "تاريخ الميلاد", "الملاحظات (النوع والغرامة)", "تاريخ الكشف الأصلي", "تاريخ ووقت الترحيل", "رقم الفاتورة", "الحالة"];
        var postRows = [postHeaders];
        for (var pi = 0; pi < postRowsList.length; pi++) {
          var pItem = postRowsList[pi];
          if (pItem && (pItem.arabicName || pItem.birthDate)) {
            postRows.push([
              postRows.length,
              pItem.arabicName || "",
              formatSheetDate(pItem.birthDate),
              pItem.notes || "",
              formatSheetDate(pItem.originalDate),
              pItem.postponedAt || "",
              pItem.invoiceId || "",
              pItem.status || "مؤجل"
            ]);
          }
        }
        postSheet.getRange(1, 1, postRows.length, postHeaders.length).setValues(postRows);
        formatHeader(postSheet, postHeaders.length);
        try {
          postSheet.setColumnWidth(1, 60);
          postSheet.setColumnWidth(2, 280);
          postSheet.setColumnWidth(3, 140);
          postSheet.setColumnWidth(4, 250);
          postSheet.setColumnWidth(5, 130);
          postSheet.setColumnWidth(6, 160);
          postSheet.setColumnWidth(7, 100);
          postSheet.setColumnWidth(8, 100);
        } catch(cwErr) {}
      }

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم تحديث وحفظ كافة البيانات في ملف جوجل شيت بنجاح! 🚀" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Direct Specific Settings Push
    if (action === "push_settings") {
      var stData = contents.settings || (contents.db && contents.db.settings) || {};
      var sSheet = getOrCreateSheet(ss, "Settings_الاعدادات_والرسائل");
      sSheet.clearContents();
      var sHeaders = ["بند الإعداد (Setting Name)", "القيمة المحفوظة (Value)", "المعرف البرمجي (Key)"];
      var sRows = [
        sHeaders,
        ["اسم وبيانات المكتب بالترويسة", stData.headerText || "", "headerText"],
        ["الترويسة الفرعية", stData.subHeaderText || "", "subHeaderText"],
        ["رسالة الترحيب واستلام الطلب", stData.welcomeMessage || "", "welcomeMessage"],
        ["قالب رسالة جاهزية الأوراق للاستلام (العامة)", stData.readyMessage || "", "readyMessage"],
        ["قالب رسالة جاهزية جوازات السفر (#)", stData.readyPassportMessage || "", "readyPassportMessage"],
        ["قالب رسالة الإنجاز الجزئي للخدمات", stData.partialReadyMessage || "", "partialReadyMessage"],
        ["قالب رسالة تم التسليم بنجاح", stData.deliveryMessage || "", "deliveryMessage"],
        ["تذييل الفاتورة المطبوعة", stData.footerText || "", "footerText"],
        ["إعدادات النظام كاملة (JSON)", JSON.stringify(stData || {}), "settings_json"]
      ];
      sSheet.getRange(1, 1, sRows.length, sRows[0].length).setValues(sRows);
      formatHeader(sSheet, sHeaders.length);
      try {
        sSheet.setColumnWidth(1, 240);
        sSheet.setColumnWidth(2, 450);
        sSheet.setColumnWidth(3, 160);
      } catch(cwErr) {}

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم حفظ وتحديث إعدادات وبيانات المكتب في ورقة (Settings_الاعدادات_والرسائل) بملف جوجل شيت بنجاح! 💾✅" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Direct Specific Dictionary Push
    if (action === "push_dictionary") {
      var dictList = contents.dictionary || (contents.db && contents.db.dictionary) || [];
      if (Array.isArray(dictList)) {
        var dSheet = ss.getSheetByName("Dictionary_قاموس_الاسماء") || 
                     ss.getSheetByName("Dictionary") || 
                     ss.getSheetByName("قاموس_الاسماء") || 
                     ss.insertSheet("Dictionary_قاموس_الاسماء");
        dSheet.clearContents();
        var dHeaders = ["م", "الاسم بالعربي", "الاسم بالإنجليزي (معايير الجوازات)"];
        var dRows = [dHeaders];
        for (var k = 0; k < dictList.length; k++) {
          dRows.push([
            k + 1,
            dictList[k].arabic || "", 
            dictList[k].english || ""
          ]);
        }
        if (dRows.length > 0) {
          dSheet.getRange(1, 1, dRows.length, dRows[0].length).setValues(dRows);
          formatHeader(dSheet, dHeaders.length);
          try {
            dSheet.setColumnWidth(1, 60);
            dSheet.setColumnWidth(2, 220);
            dSheet.setColumnWidth(3, 260);
          } catch(cwErr) {}
        }
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "success", 
          message: "تم تسجيل وتحديث ورقة قاموس الأسماء (" + dictList.length + " اسم) بملف جوجل شيت بنجاح! 📖✅" 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 4. Direct Specific Government Fines Push
    if (action === "push_fines") {
      var finesList = contents.governmentFines || (contents.db && contents.db.governmentFines) || [];
      if (Array.isArray(finesList)) {
        var fSheet = findOrCreateSheet(ss, ["GovernmentFines_الغرامات_الحكومية", "GovernmentFines", "الغرامات_الحكومية", "الغرامات الحكومية", "الغرامات", "بنود_الغرامات", "بنود الغرامات", "غرامات", "fines"], "GovernmentFines_الغرامات_الحكومية");
        fSheet.clearContents();
        var fHeaders = ["المعرف ID", "اسم بند الغرامة الحكومية", "المبلغ الافتراضي (ج.م)", "شروط وملاحظات التطبيق"];
        var fRows = [fHeaders];
        for (var fi = 0; fi < finesList.length; fi++) {
          fRows.push([
            finesList[fi].id || ("fine-" + (fi + 1)),
            finesList[fi].name || "",
            Number(finesList[fi].amount) || 0,
            finesList[fi].notes || ""
          ]);
        }
        if (fRows.length > 0) {
          fSheet.getRange(1, 1, fRows.length, fRows[0].length).setValues(fRows);
          formatHeader(fSheet, fHeaders.length);
          try {
            fSheet.setColumnWidth(1, 100);
            fSheet.setColumnWidth(2, 250);
            fSheet.setColumnWidth(3, 160);
            fSheet.setColumnWidth(4, 350);
          } catch(cwErr) {}
        }
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "success", 
          message: "تم تسجيل وتحديث ورقة الغرامات الحكومية (" + finesList.length + " بند) بملف جوجل شيت بنجاح! ⚖️✅" 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 5. Direct Specific Aman Report Push
    if (action === "push_aman") {
      var aRowsList = contents.amanRows || [];
      var aSheet = findOrCreateSheet(ss, ["Aman_كشف_حركة_الخدمات_الجماهيرية", "Aman", "كشف_امان", "كشف امان", "كشف أمان", "أمان", "امان"], "Aman_كشف_حركة_الخدمات_الجماهيرية");
      aSheet.clearContents();
      var aHeaders = ["م", "الاسم", "تاريخ الميلاد", "الملاحظات (النوع والغرامة)", "رقم الفاتورة", "التاريخ"];
      var aRows = [aHeaders];
      for (var ar = 0; ar < aRowsList.length; ar++) {
        var rowItem = aRowsList[ar];
        if (rowItem && (rowItem.arabicName || rowItem.birthDate || rowItem.notes)) {
          aRows.push([
            ar + 1,
            rowItem.arabicName || "",
            formatSheetDate(rowItem.birthDate),
            rowItem.notes || "",
            rowItem.invoiceId || "",
            formatSheetDate(rowItem.date || contents.dateFrom)
          ]);
        }
      }
      aSheet.getRange(1, 1, aRows.length, aHeaders.length).setValues(aRows);
      formatHeader(aSheet, aHeaders.length);
      try {
        aSheet.setColumnWidth(1, 60);
        aSheet.setColumnWidth(2, 280);
        aSheet.setColumnWidth(3, 140);
        aSheet.setColumnWidth(4, 250);
        aSheet.setColumnWidth(5, 110);
        aSheet.setColumnWidth(6, 120);
      } catch(cwErr) {}
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم حفظ وتحديث كشف أمان في ورقة (Aman_كشف_حركة_الخدمات_الجماهيرية) بملف جوجل شيت بنجاح! 📑✅" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 5.5 Direct Specific Aman Postponed Names Push
    if (action === "push_postponed_aman") {
      var pRowsList = contents.postponedRows || contents.amanPostponedRows || [];
      var pSheet = findOrCreateSheet(ss, ["الأسماء المرحلة", "الاسماء المرحلة", "الأسماء_المرحلة", "الاسماء_المرحلة", "Aman_Postponed_الأسماء_المرحلة", "Aman_Postponed", "المؤجلين", "المرحلين"], "الأسماء_المرحلة");
      pSheet.clearContents();
      var pHeaders = ["م", "الاسم", "تاريخ الميلاد", "الملاحظات (النوع والغرامة)", "تاريخ الكشف الأصلي", "تاريخ ووقت الترحيل", "رقم الفاتورة", "الحالة"];
      var pRows = [pHeaders];
      for (var pr = 0; pr < pRowsList.length; pr++) {
        var prItem = pRowsList[pr];
        if (prItem && (prItem.arabicName || prItem.birthDate || prItem.notes)) {
          pRows.push([
            pRows.length,
            prItem.arabicName || "",
            formatSheetDate(prItem.birthDate),
            prItem.notes || "",
            formatSheetDate(prItem.originalDate),
            prItem.postponedAt || "",
            prItem.invoiceId || "",
            prItem.status || "مؤجل"
          ]);
        }
      }
      pSheet.getRange(1, 1, pRows.length, pHeaders.length).setValues(pRows);
      formatHeader(pSheet, pHeaders.length);
      try {
        pSheet.setColumnWidth(1, 60);
        pSheet.setColumnWidth(2, 280);
        pSheet.setColumnWidth(3, 140);
        pSheet.setColumnWidth(4, 250);
        pSheet.setColumnWidth(5, 130);
        pSheet.setColumnWidth(6, 160);
        pSheet.setColumnWidth(7, 100);
        pSheet.setColumnWidth(8, 100);
      } catch(cwErr) {}
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم حفظ وتحديث ورقة الأسماء المرحلة بملف جوجل شيت بنجاح! 📑✂️" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 5.6 Combined Aman and Postponed Sync (Single Atomic Operation for Cut/Insert)
    if (action === "sync_aman_and_postponed" || action === "cut_and_postpone_aman" || action === "insert_postponed_to_aman") {
      // 1. Update Aman sheet
      if (contents.amanRows || contents.amanReport) {
        var aList = contents.amanRows || contents.amanReport || [];
        var aSheet = findOrCreateSheet(ss, ["Aman_كشف_حركة_الخدمات_الجماهيرية", "Aman", "كشف_امان", "كشف امان", "كشف أمان", "أمان", "امان"], "Aman_كشف_حركة_الخدمات_الجماهيرية");
        aSheet.clearContents();
        var aHeaders = ["م", "الاسم", "تاريخ الميلاد", "الملاحظات (النوع والغرامة)", "رقم الفاتورة", "التاريخ"];
        var aRows = [aHeaders];
        for (var ar = 0; ar < aList.length; ar++) {
          var aItem = aList[ar];
          if (aItem && (aItem.arabicName || aItem.birthDate || aItem.notes)) {
            aRows.push([
              aRows.length,
              aItem.arabicName || "",
              formatSheetDate(aItem.birthDate),
              aItem.notes || "",
              aItem.invoiceId || "",
              formatSheetDate(aItem.date)
            ]);
          }
        }
        if (aRows.length > 0) {
          aSheet.getRange(1, 1, aRows.length, aHeaders.length).setValues(aRows);
          formatHeader(aSheet, aHeaders.length);
          try {
            aSheet.setColumnWidth(1, 60);
            aSheet.setColumnWidth(2, 280);
            aSheet.setColumnWidth(3, 140);
            aSheet.setColumnWidth(4, 250);
            aSheet.setColumnWidth(5, 110);
            aSheet.setColumnWidth(6, 120);
          } catch(cwErr) {}
        }
      }

      // 2. Update Postponed sheet
      if (contents.postponedRows || contents.amanPostponedRows) {
        var pList = contents.postponedRows || contents.amanPostponedRows || [];
        var pSheet = findOrCreateSheet(ss, ["الأسماء المرحلة", "الاسماء المرحلة", "الأسماء_المرحلة", "الاسماء_المرحلة", "Aman_Postponed_الأسماء_المرحلة", "Aman_Postponed", "المؤجلين", "المرحلين"], "الأسماء_المرحلة");
        pSheet.clearContents();
        var pHeaders = ["م", "الاسم", "تاريخ الميلاد", "الملاحظات (النوع والغرامة)", "تاريخ الكشف الأصلي", "تاريخ ووقت الترحيل", "رقم الفاتورة", "الحالة"];
        var pRows = [pHeaders];
        for (var pr = 0; pr < pList.length; pr++) {
          var prItem = pList[pr];
          if (prItem && (prItem.arabicName || prItem.birthDate || prItem.notes)) {
            pRows.push([
              pRows.length,
              prItem.arabicName || "",
              formatSheetDate(prItem.birthDate),
              prItem.notes || "",
              formatSheetDate(prItem.originalDate),
              prItem.postponedAt || "",
              prItem.invoiceId || "",
              prItem.status || "مؤجل"
            ]);
          }
        }
        if (pRows.length > 0) {
          pSheet.getRange(1, 1, pRows.length, pHeaders.length).setValues(pRows);
          formatHeader(pSheet, pHeaders.length);
          try {
            pSheet.setColumnWidth(1, 60);
            pSheet.setColumnWidth(2, 280);
            pSheet.setColumnWidth(3, 140);
            pSheet.setColumnWidth(4, 250);
            pSheet.setColumnWidth(5, 130);
            pSheet.setColumnWidth(6, 160);
            pSheet.setColumnWidth(7, 100);
            pSheet.setColumnWidth(8, 100);
          } catch(cwErr) {}
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم تحديث ورقة كشف أمان وورقة الأسماء المرحلة بملف جوجل شيت معاً بنجاح! 📑✂️" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 6. Direct Specific Invoices Push / Sync
    if (action === "push_invoices") {
      var invoicesList = contents.invoices || (contents.db && contents.db.invoices) || [];
      if (Array.isArray(invoicesList)) {
        var invSheet = getOrCreateSheet(ss, "Invoices_الفواتير");
        invSheet.clearContents();
        var invHeaders = [
          "رقم الفاتورة", "التاريخ", "الحالة", "الموظف", "مكان الحفظ (رقم الدرج)", 
          "رسوم حكومية", "رسوم مكتب", "الإجمالي الكلي", "أسماء العملاء", "أرقام الهواتف", 
          "الخدمات المطلوبة", "تفاصيل العملاء كاملة (JSON)"
        ];
        var invRows = [invHeaders];
        for (var ii = 0; ii < invoicesList.length; ii++) {
          var invItem = invoicesList[ii];
          var cNames = [];
          var cPhones = [];
          var sList = [];
          if (invItem.customers && Array.isArray(invItem.customers)) {
            for (var ki = 0; ki < invItem.customers.length; ki++) {
              var ci = invItem.customers[ki];
              cNames.push(ci.arabicName + (ci.englishName ? " (" + ci.englishName + ")" : ""));
              if (ci.phone) cPhones.push(ci.phone);
              if (ci.services && Array.isArray(ci.services)) {
                for (var si = 0; si < ci.services.length; si++) {
                  var so = ci.services[si];
                  var st = so.serviceId + " x" + (so.quantity || 1);
                  if (so.fineName || (so.fineAmount && so.fineAmount > 0)) {
                    var fd = so.fineName ? (so.fineName.indexOf("غرامة") === 0 ? so.fineName : "غرامة " + so.fineName) : "غرامة حكومية";
                    st += " [" + fd + " +" + (so.fineAmount || 0) + " ج.م]";
                  }
                  sList.push(st);
                }
              }
            }
          }
          invRows.push([
            invItem.invoiceId || "",
            invItem.date || "",
            invItem.status || "",
            invItem.employeeName || "",
            invItem.archiveDrawer || "",
            invItem.totalGov || 0,
            invItem.totalOffice || 0,
            invItem.totalAmount || 0,
            cNames.join(" | "),
            cPhones.join(" | "),
            sList.join(" , "),
            JSON.stringify(invItem.customers || [])
          ]);
        }
        if (invRows.length > 0) {
          invSheet.getRange(1, 1, invRows.length, invRows[0].length).setValues(invRows);
          formatHeader(invSheet, invHeaders.length);
        }
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "success", 
          message: "تم حفظ وتحديث ورقة الفواتير بملف جوجل شيت بنجاح! 🧾✅" 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      error: "إجراء غير معروف" 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({ 
      error: e.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var db = {
      settings: {},
      services: [],
      invoices: [],
      collectionClosings: [],
      dictionary: [],
      governmentFines: [],
      amanReport: [],
      amanPostponedRows: []
    };

    // 1. Read Settings
    var stSheet = ss.getSheetByName("Settings_الاعدادات_والرسائل");
    if (stSheet) {
      var stValues = stSheet.getDataRange().getValues();
      for (var r = 1; r < stValues.length; r++) {
        var key = String(stValues[r][2] || "").trim();
        var val = stValues[r][1];
        if (key === "settings_json" && val) {
          try {
            var parsed = JSON.parse(val);
            db.settings = parsed;
          } catch(e) {}
        } else if (key) {
          db.settings[key] = val;
        }
      }
    }

    // 2. Read Services
    var srvSheet = ss.getSheetByName("Services_الخدمات_والاسعار");
    if (srvSheet) {
      var srvValues = srvSheet.getDataRange().getValues();
      for (var s = 1; s < srvValues.length; s++) {
        var sRow = srvValues[s];
        if (sRow[1] || sRow[2]) {
          db.services.push({
            order: sRow[0],
            id: String(sRow[1] || ""),
            name: String(sRow[2] || ""),
            govPrice: Number(sRow[3]) || 0,
            officeFee: Number(sRow[4]) || 0,
            duration: String(sRow[6] || ""),
            instructions: String(sRow[7] || ""),
            deliveryDaysOffset: Number(sRow[8]) || 0,
            notes: String(sRow[9] || "")
          });
        }
      }
    }

    // 3. Read Invoices
    var invSheet = ss.getSheetByName("Invoices_الفواتير");
    if (invSheet) {
      var invValues = invSheet.getDataRange().getValues();
      for (var i = 1; i < invValues.length; i++) {
        var row = invValues[i];
        if (row[0]) {
          var custData = [];
          if (row[11]) {
            try {
              custData = JSON.parse(row[11]);
            } catch(e) {}
          }
          db.invoices.push({
            invoiceId: Number(row[0]) || row[0],
            date: formatSheetDate(row[1]),
            status: row[2] || "جديد",
            employeeName: row[3] || "",
            archiveDrawer: row[4] || "",
            totalGov: Number(row[5]) || 0,
            totalOffice: Number(row[6]) || 0,
            totalAmount: Number(row[7]) || 0,
            customers: custData
          });
        }
      }
    }

    // 4. Read Closings
    var clsSheet = ss.getSheetByName("Closings_تقفيل_الخزينة");
    if (clsSheet) {
      var clsValues = clsSheet.getDataRange().getValues();
      for (var c = 1; c < clsValues.length; c++) {
        var cRow = clsValues[c];
        if (cRow[0]) {
          db.collectionClosings.push({
            id: String(cRow[0]),
            closeDate: formatSheetDate(cRow[1]),
            closedBy: String(cRow[2] || ""),
            totalRevenue: Number(cRow[3]) || 0,
            totalOfficeProfit: Number(cRow[4]) || 0,
            cashCollected: Number(cRow[5]) || 0,
            deferredAmount: Number(cRow[6]) || 0,
            notes: String(cRow[7] || "")
          });
        }
      }
    }

    // 5. Read Dictionary
    var dictSheet = ss.getSheetByName("Dictionary_قاموس_الاسماء") || ss.getSheetByName("Dictionary") || ss.getSheetByName("قاموس_الاسماء");
    if (dictSheet) {
      var dictValues = dictSheet.getDataRange().getValues();
      for (var d = 1; d < dictValues.length; d++) {
        var dRow = dictValues[d];
        if (dRow[1] || dRow[2]) {
          db.dictionary.push({
            arabic: String(dRow[1] || "").trim(),
            english: String(dRow[2] || "").trim()
          });
        }
      }
    }

    // 6. Read Government Fines
    var fineSheet = ss.getSheetByName("GovernmentFines_الغرامات_الحكومية") || ss.getSheetByName("GovernmentFines") || ss.getSheetByName("الغرامات_الحكومية");
    if (fineSheet) {
      var fineValues = fineSheet.getDataRange().getValues();
      for (var f = 1; f < fineValues.length; f++) {
        var fRow = fineValues[f];
        if (fRow[0] || fRow[1]) {
          db.governmentFines.push({
            id: String(fRow[0] || "fine-" + f),
            name: String(fRow[1] || ""),
            amount: Number(fRow[2]) || 0,
            notes: String(fRow[3] || "")
          });
        }
      }
    }

    // 7. Read Aman Report (Aman_كشف_حركة_الخدمات_الجماهيرية)
    var amanReportSheet = findOrCreateSheet(ss, ["Aman_كشف_حركة_الخدمات_الجماهيرية", "Aman", "كشف_امان", "كشف امان", "كشف أمان", "أمان", "امان"], "Aman_كشف_حركة_الخدمات_الجماهيرية");
    db.amanReport = [];
    if (amanReportSheet) {
      var aValRange = amanReportSheet.getDataRange().getValues();
      if (aValRange && aValRange.length > 1) {
        for (var aRowIdx = 1; aRowIdx < aValRange.length; aRowIdx++) {
          var aRow = aValRange[aRowIdx];
          var aName = String(aRow[1] || "").trim();
          var aBirth = formatSheetDate(aRow[2]);
          var aNotes = String(aRow[3] || "").trim();
          var aInvId = aRow[4] !== undefined && aRow[4] !== "" ? Number(aRow[4]) : undefined;
          var aDate = formatSheetDate(aRow[5]);
          if (aName || aBirth || aNotes) {
            db.amanReport.push({
              id: "sheet-row-" + aRowIdx,
              arabicName: aName,
              birthDate: aBirth,
              notes: aNotes,
              invoiceId: aInvId,
              date: aDate
            });
          }
        }
      }
    }

    // 8. Read Aman Postponed Report (الأسماء المرحلة)
    var postReportSheet = findOrCreateSheet(ss, ["الأسماء المرحلة", "الاسماء المرحلة", "الأسماء_المرحلة", "الاسماء_المرحلة", "Aman_Postponed_الأسماء_المرحلة", "Aman_Postponed", "المؤجلين", "المرحلين"], "الأسماء_المرحلة");
    db.amanPostponedRows = [];
    if (postReportSheet) {
      var pValRange = postReportSheet.getDataRange().getValues();
      if (pValRange && pValRange.length > 1) {
        for (var pRowIdx = 1; pRowIdx < pValRange.length; pRowIdx++) {
          var pRow = pValRange[pRowIdx];
          var pName = String(pRow[1] || "").trim();
          var pBirth = formatSheetDate(pRow[2]);
          var pNotes = String(pRow[3] || "").trim();
          var pOrigDate = formatSheetDate(pRow[4]);
          var pPostAt = String(pRow[5] || "").trim();
          var pInvId = pRow[6] !== undefined && pRow[6] !== "" ? Number(pRow[6]) : undefined;
          var pStatus = String(pRow[7] || "مؤجل").trim();
          if (pName || pBirth) {
            db.amanPostponedRows.push({
              id: "postponed-" + pRowIdx + "-" + Date.now(),
              arabicName: pName,
              birthDate: pBirth,
              notes: pNotes,
              originalDate: pOrigDate,
              postponedAt: pPostAt,
              invoiceId: pInvId,
              status: pStatus
            });
          }
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", db: db }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function findOrCreateSheet(ss, candidates, defaultName) {
  if (!Array.isArray(candidates)) candidates = [candidates];
  var allSheets = ss.getSheets();
  
  // Pass 1: Strict exact name match (case-insensitive & trimmed)
  for (var i = 0; i < candidates.length; i++) {
    var cand = String(candidates[i] || "").trim().toLowerCase();
    if (!cand) continue;
    for (var j = 0; j < allSheets.length; j++) {
      var sName = allSheets[j].getName().trim().toLowerCase();
      if (sName === cand) {
        return allSheets[j];
      }
    }
  }

  // Pass 2: Normalized Arabic match (ignoring hamzas, taa marbuta, and spaces/underscores)
  function normAr(t) {
    return String(t || "").trim().toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\s_\-]+/g, "");
  }
  for (var i = 0; i < candidates.length; i++) {
    var candNorm = normAr(candidates[i]);
    if (!candNorm) continue;
    for (var j = 0; j < allSheets.length; j++) {
      var sNorm = normAr(allSheets[j].getName());
      if (sNorm === candNorm) {
        return allSheets[j];
      }
    }
  }

  // Pass 3: Sheet name contains candidate keyword (only if sheet name is longer and contains cand)
  for (var i = 0; i < candidates.length; i++) {
    var cand = String(candidates[i] || "").trim().toLowerCase();
    if (!cand || cand.length < 3) continue;
    for (var j = 0; j < allSheets.length; j++) {
      var sName = allSheets[j].getName().trim().toLowerCase();
      if (sName.indexOf(cand) !== -1) {
        return allSheets[j];
      }
    }
  }

  return getOrCreateSheet(ss, defaultName);
}

function formatSheetDate(val) {
  if (!val && val !== 0) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT+3", "yyyy/MM/dd");
  }
  var s = String(val).trim();
  if (s.indexOf("GMT") !== -1 || /^[A-Za-z]{3}\s+[A-Za-z]{3}/.test(s)) {
    try {
      var d = new Date(s);
      if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, Session.getScriptTimeZone() || "GMT+3", "yyyy/MM/dd");
      }
    } catch(e) {}
  }
  var iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return iso[1] + "/" + (iso[2].length === 1 ? "0" + iso[2] : iso[2]) + "/" + (iso[3].length === 1 ? "0" + iso[3] : iso[3]);
  }
  var dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    return dmy[3] + "/" + (dmy[2].length === 1 ? "0" + dmy[2] : dmy[2]) + "/" + (dmy[1].length === 1 ? "0" + dmy[1] : dmy[1]);
  }
  var digits = s.replace(/\\D/g, "");
  if (digits.length === 14) {
    var c = parseInt(digits.charAt(0));
    var y = (c === 3 ? 2000 : 1900) + parseInt(digits.substring(1, 3));
    var m = digits.substring(3, 5);
    var day = digits.substring(5, 7);
    return y + "/" + m + "/" + day;
  }
  return s;
}

function formatHeader(sheet, numCols) {
  try {
    sheet.setRightToLeft(true);
    sheet.setFrozenRows(1);
    var range = sheet.getRange(1, 1, 1, numCols);
    range.setBackground("#1e293b");
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    range.setHorizontalAlignment("center");
  } catch(e) {}
}`;
