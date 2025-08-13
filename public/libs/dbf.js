(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.dbf = {}));
})(this, (function (exports) { 'use strict';

    var fieldsize = {
        // string
        C: 254,
        // boolean
        L: 1,
        // date
        D: 8,
        // number
        N: 18,
        // number
        M: 18,
        // number, float
        F: 18,
        // number
        B: 8,
    };

    /**
     * @param {string} str
     * @param {number} len
     * @param {string} char
     * @returns {string}
     */
    var lpad = function lpad(str, len, char) {
        while (str.length < len) { str = char + str; } return str;
    };

    /**
     * @param {string} str
     * @param {number} len
     * @param {string} char
     * @returns {string}
     */
    var rpad = function rpad(str, len, char) {
        while (str.length < len) { str = str + char; } return str;
    };

    /**
     * @param {object} view
     * @param {number} fieldLength
     * @param {string} str
     * @param {number} offset
     * @returns {number}
     */
    var writeField = function writeField(view, fieldLength, str, offset) {
        for (var i = 0; i < fieldLength; i++) {
            view.setUint8(offset, str.charCodeAt(i)); offset++;
        }
        return offset;
    };

    var lib = {
    	lpad: lpad,
    	rpad: rpad,
    	writeField: writeField
    };

    var types = {
        string: 'C',
        number: 'N',
        boolean: 'L',
        // type to use if all values of a field are null
        null: 'C'
    };

    var multi_1 = multi;
    var bytesPer_1 = bytesPer;
    var obj_1 = obj;

    function multi(features) {
        var fields = {};
        features.forEach(collect);
        function collect(f) { inherit(fields, f); }
        return obj(fields);
    }

    /**
     * @param {Object} a
     * @param {Object} b
     * @returns {Object}
     */
    function inherit(a, b) {
        for (var i in b) {
            var isDef = typeof b[i] !== 'undefined' && b[i] !== null;
            if (typeof a[i] === 'undefined' || isDef) {
              a[i] = b[i];
            }
        }
        return a;
    }

    function obj(_) {
        var fields = {}, o = [];
        for (var p in _) fields[p] = _[p] === null ? 'null' : typeof _[p];
        for (var n in fields) {
            var t = types[fields[n]];
            if(t){
                 o.push({
                    name: n,
                    type: t,
                    size: fieldsize[t]
                });
            }
        }
        return o;
    }

    /**
     * @param {Array} fields
     * @returns {Array}
     */
    function bytesPer(fields) {
        // deleted flag
        return fields.reduce(function(memo, f) { return memo + f.size; }, 1);
    }

    var fields = {
    	multi: multi_1,
    	bytesPer: bytesPer_1,
    	obj: obj_1
    };

    /**
     * @param {Array} data
     * @param {Array} meta
     * @returns {Object} view
     */
    var structure$1 = function structure(data, meta) {

        var field_meta = meta || fields.multi(data),
            fieldDescLength = (32 * field_meta.length) + 1,
            bytesPerRecord = fields.bytesPer(field_meta), // deleted flag
            buffer = new ArrayBuffer(
                // field header
                fieldDescLength +
                // header
                32 +
                // contents
                (bytesPerRecord * data.length) +
                // EOF marker
                1
        ),
            now = new Date(),
            view = new DataView(buffer);

        // version number - dBase III
        view.setUint8(0, 0x03);
        // date of last update
        view.setUint8(1, now.getFullYear() - 1900);
        view.setUint8(2, now.getMonth() + 1);
        view.setUint8(3, now.getDate());
        // number of records
        view.setUint32(4, data.length, true);

        // length of header
        var headerLength = fieldDescLength + 32;
        view.setUint16(8, headerLength, true);
        // length of each record
        view.setUint16(10, bytesPerRecord, true);

        // Terminator
        view.setInt8(32 + fieldDescLength - 1, 0x0D);

        field_meta.forEach(function(f, i) {
            // field name
            f.name.split('').slice(0, 10).forEach(function(c, x) {
                view.setInt8(32 + i * 32 + x, c.charCodeAt(0));
            });
            // field type
            view.setInt8(32 + i * 32 + 11, f.type.charCodeAt(0));
            // field length
            view.setInt8(32 + i * 32 + 16, f.size);
            if (f.type == 'N') view.setInt8(32 + i * 32 + 17, 3);
        });

        var offset = fieldDescLength + 32;

        data.forEach(function(row, num) {
            // delete flag: this is not deleted
            view.setUint8(offset, 32);
            offset++;
            field_meta.forEach(function(f) {
                var val = row[f.name];
                if (val === null || typeof val === 'undefined') val = '';

                switch (f.type) {
                    // boolean
                    case 'L':
                        view.setUint8(offset, val ? 84 : 70);
                        offset++;
                        break;

                    // date
                    case 'D':
                        offset = lib.writeField(view, 8,
                            lib.lpad(val.toString(), 8, ' '), offset);
                        break;

                    // number
                    case 'N':
                        offset = lib.writeField(view, f.size,
                            lib.lpad(val.toString(), f.size, ' ').substr(0, 18),
                            offset);
                        break;

                    // string
                    case 'C':
                        offset = lib.writeField(view, f.size,
                            lib.rpad(val.toString(), f.size, ' '), offset);
                        break;

                    default:
                        throw new Error('Unknown field type');
                }
            });
        });

        // EOF flag
        view.setUint8(offset, 0x1A);

        return view;
    };

    var structure = structure$1;

    var dbf = {
    	structure: structure
    };

    exports["default"] = dbf;
    exports.structure = structure;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
