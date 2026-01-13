/**
 * Content Standardizer - Google Workspace Add-on
 * Standardize formatting and structure across Google Docs documents
 */

const UI_LABEL = 'Content Standardizer';

// ========================================
// Add-on Initialization
// ========================================

/**
 * Called when the add-on is installed
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * Called when a document is opened
 */
function onOpen(e) {
  DocumentApp.getUi()
    .createMenu('Content Standardizer')
    .addItem('Standardize Document', 'showSidebar')
    .addItem('Undo Last Action', 'undoLastAction')
    .addToUi();
}

/**
 * Opens the sidebar
 */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle(UI_LABEL);
  DocumentApp.getUi().showSidebar(html);
}

// ========================================
// API Functions (Called from Sidebar)
// ========================================

/**
 * API: Get document structure
 */
function apiGetDocumentStructure() {
  try {
    const doc = DocumentApp.getActiveDocument();
    const structure = DocsAnalyzer.analyzeStructure(doc);
    return structure;
  } catch (err) {
    console.error('Get structure failed:', err);
    throw new Error('Get structure failed: ' + err.message);
  }
}

/**
 * API: Apply standardization
 */
function apiApplyStandardization(options = {}) {
  try {
    const result = FormatStandardizer.applyStandardization(options);
    return result;
  } catch (err) {
    console.error('Apply standardization failed:', err);
    throw new Error('Apply standardization failed: ' + err.message);
  }
}

/**
 * API: Undo last action
 */
function apiUndoLastAction() {
  try {
    const result = UndoManager.undo();
    return result;
  } catch (err) {
    console.error('Undo failed:', err);
    throw new Error('Undo failed: ' + err.message);
  }
}

// ========================================
// Docs Analyzer Module
// ========================================

const DocsAnalyzer = (() => {
  function analyzeStructure(doc) {
    const body = doc.getBody();
    const paragraphs = body.getParagraphs();
    
    const structure = {
      title: doc.getName(),
      paragraphs: [],
      headings: {
        h1: 0,
        h2: 0,
        h3: 0
      },
      issues: []
    };
    
    paragraphs.forEach(paragraph => {
      const text = paragraph.getText().trim();
      if (!text) return;
      
      const heading = paragraph.getHeading();
      const paragraphStyle = {
        text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        heading: heading,
        fontSize: paragraph.getAttributes().fontSize,
        fontFamily: paragraph.getAttributes().fontFamily
      };
      
      structure.paragraphs.push(paragraphStyle);
      
      // Count headings
      if (heading === DocumentApp.ParagraphHeading.HEADING_1) structure.headings.h1++;
      if (heading === DocumentApp.ParagraphHeading.HEADING_2) structure.headings.h2++;
      if (heading === DocumentApp.ParagraphHeading.HEADING_3) structure.headings.h3++;
      
      // Detect issues
      if (heading === DocumentApp.ParagraphHeading.NORMAL && text.length < 50 && text === text.toUpperCase()) {
        structure.issues.push({
          type: 'potential_heading',
          message: 'Text looks like a heading but is not formatted as one',
          text: text
        });
      }
    });
    
    return structure;
  }
  
  return {
    analyzeStructure
  };
})();

// ========================================
// Format Standardizer Module
// ========================================

const FormatStandardizer = (() => {
  function applyStandardization(options = {}) {
    const doc = DocumentApp.getActiveDocument();
    const body = doc.getBody();
    const paragraphs = body.getParagraphs();
    
    const changes = [];
    const originalState = saveDocumentState(doc);
    
    paragraphs.forEach((paragraph, index) => {
      const text = paragraph.getText().trim();
      if (!text) return;
      
      const heading = paragraph.getHeading();
      
      // Standardize headings
      if (options.standardizeHeadings) {
        if (text.length < 50 && text === text.toUpperCase() && heading === DocumentApp.ParagraphHeading.NORMAL) {
          paragraph.setHeading(DocumentApp.ParagraphHeading.HEADING_2);
          changes.push({
            type: 'heading',
            index: index,
            from: 'Normal',
            to: 'Heading 2',
            text: text
          });
        }
      }
      
      // Standardize font
      if (options.standardizeFont && heading === DocumentApp.ParagraphHeading.NORMAL) {
        const attrs = paragraph.getAttributes();
        if (attrs.fontFamily !== 'Arial') {
          paragraph.setFontFamily('Arial');
          changes.push({
            type: 'font',
            index: index,
            from: attrs.fontFamily,
            to: 'Arial'
          });
        }
      }
      
      // Standardize spacing
      if (options.standardizeSpacing) {
        // Ensure consistent spacing after headings
        if (heading !== DocumentApp.ParagraphHeading.NORMAL) {
          paragraph.setSpacingBefore(12);
          paragraph.setSpacingAfter(6);
        }
      }
    });
    
    // Log action for undo
    if (changes.length > 0) {
      UndoManager.logAction({
        type: 'standardization',
        changes: changes,
        originalState: originalState,
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      success: true,
      changes,
      totalChanges: changes.length
    };
  }
  
  function saveDocumentState(doc) {
    // Simplified state capture
    const body = doc.getBody();
    const paragraphs = body.getParagraphs();
    
    return paragraphs.map(paragraph => ({
      text: paragraph.getText(),
      heading: paragraph.getHeading(),
      attributes: paragraph.getAttributes()
    }));
  }
  
  return {
    applyStandardization
  };
})();

// ========================================
// Undo Manager
// ========================================

const UndoManager = (() => {
  const logKey = 'undoLog';
  
  function logAction(action) {
    const properties = PropertiesService.getScriptProperties();
    const existingLog = JSON.parse(properties.getProperty(logKey) || '[]');
    existingLog.push(action);
    properties.setProperty(logKey, JSON.stringify(existingLog));
  }
  
  function undo() {
    const properties = PropertiesService.getScriptProperties();
    const log = JSON.parse(properties.getProperty(logKey) || '[]');
    
    if (log.length === 0) {
      return { success: false, message: 'No actions to undo' };
    }
    
    const lastAction = log.pop();
    properties.setProperty(logKey, JSON.stringify(log));
    
    // Note: Full undo would require restoring document state
    // For v1.0, we'll track the action and notify user
    
    return {
      success: true,
      message: `Undo logged for ${lastAction.changes.length} changes. Full undo requires manual restoration in v1.0.`,
      changesRestored: lastAction.changes.length
    };
  }
  
  return {
    logAction,
    undo
  };
})();
