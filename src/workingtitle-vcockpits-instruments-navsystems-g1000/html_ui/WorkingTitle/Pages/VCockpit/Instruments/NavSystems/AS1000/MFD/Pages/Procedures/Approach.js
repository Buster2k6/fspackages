class WT_Procedure {
    constructor(name) {
        this._name = name;
    }
    getTransition(transitionIndex) {
        return null;
    }
    getTransitions() {
        return null;
    }
    getRunways() {
        return null;
    }
    getSequence(transition, runwayIndex) {
        return null;
    }
    getPrimaryFrequency() {
        return null;
    }
    get name() {
        return this._name;
    }
}

class WT_Approach_Procedure extends WT_Procedure {
    constructor(airport, approach) {
        super(approach.name);

        let frequency = airport.frequencies.find(f => {
            return f.name.replace("RW0", "").replace("RW", "").indexOf(approach.runway) !== -1;
        });
        this.primaryFrequency = frequency ? frequency : null;

        this.waypoints = approach.wayPoints;
        this.transitions = approach.transitions;
    }
    getTransition(transitionIndex) {
        return this.transitions[transitionIndex];
    }
    getTransitions() {
        return this.transitions;
    }
    getSequence(transition, runwayIndex) {
        let waypoints = [];
        if (transition !== null) {
            waypoints.push(...transition.waypoints);
        }
        waypoints.push(...this.waypoints);

        return waypoints;
    }
    getPrimaryFrequency() {
        return this.primaryFrequency;
    }
}

class WT_Departure_Procedure extends WT_Procedure {
    constructor(airport, departure) {
        super(departure.name);
        this.enRouteTransitions = departure.runwayTransitions;
        this.commonLegs = departure.commonLegs;
        this.runwayTransitions = departure.runwayTransitions;
    }
    getTransition(transitionIndex) {
        return this.enRouteTransitions[transitionIndex];
    }
    getRunways() {
        return this.runwayTransitions;
    }
    getTransitions() {
        return this.enRouteTransitions;
    }
    getSequence(transition, runwayIndex) {
        let waypoints = [];
        if (transition !== null) {
            waypoints.push(...transition.legs.map(leg => {
                return {
                    icao: leg.fixIcao,
                    bearing: leg.course,
                    distance: leg.distance * 0.000539957,
                    ident: leg.fixIcao.substr(7, 5).trim()
                }
            }));
        }
        waypoints.push(...this.commonLegs.map(leg => {
            return {
                icao: leg.fixIcao,
                bearing: leg.course,
                distance: leg.distance * 0.000539957,
                ident: leg.fixIcao.substr(7, 5).trim()
            }
        }));

        console.log(JSON.stringify(transition.legs));

        return waypoints;
    }
}

class WT_Procedure_Renderer {

}

class WT_Procedure_Sub_Page {
    constructor(airport) {
        this.procedures = new Subject();
        this.selectedProcedure = new Subject([]);
        airport.subscribe(this.airportUpdated.bind(this));
    }
    airportUpdated(airport) {

    }
    getProcedure(procedureIndex) {

    }
    getProcedureType() {

    }
}

class WT_Procedure_Sub_Page_Approaches extends WT_Procedure_Sub_Page {
    airportUpdated(airport) {
        if (airport)
            this.procedures.value = airport.approaches.map(approach => new WT_Approach_Procedure(airport, approach));
    }
    getProcedure(procedureIndex) {
        return this.procedures.value[procedureIndex];
    }
    getProcedureType() {
        return "Approaches";
    }
}

class WT_Procedure_Sub_Page_Departures extends WT_Procedure_Sub_Page {
    airportUpdated(airport) {
        try {
            if (airport)
                this.procedures.value = airport.departures.map(departure => new WT_Departure_Procedure(airport, departure));
        } catch (e) {
            console.log(e);
        }
    }
    getProcedure(procedureIndex) {
        return this.procedures.value[procedureIndex];
    }
    getProcedureType() {
        return "Departures";
    }
}

class WT_Approach_Page_Model extends WT_Model {
    /**
     * @param {AS1000_MFD} gps 
     * @param {FlightPlanManager} flightPlan 
     * @param {WaypointLoader} facilityLoader 
     */
    constructor(gps, flightPlan, facilityLoader) {
        super();

        this.gps = gps;
        this.flightPlan = flightPlan;
        this.facilityLoader = facilityLoader;

        this.icao = null;
        this.airport = new Subject();
        this.procedureType = new Subject();
        this.procedures = new Subject();
        this.transitions = new Subject();
        this.sequence = new Subject();
        this.waypoints = new Subject();
        this.primaryFrequency = new Subject();
        this.mapCoordinates = new Subject();

        this.selectedProcedure = null;
        this.selectedTransition = null;

        this.subPage = null;
        this.subPages = {
            "DP": new WT_Procedure_Sub_Page_Departures(this.airport),
            "APR": new WT_Procedure_Sub_Page_Approaches(this.airport),
            "STAR": null,
        }

        this.showSubPage("DP");

        this.airport.subscribe(this.updateAirport.bind(this));
        this.sequence.subscribe(this.updateWaypoints.bind(this));
    }
    showSubPage(id) {
        if (this.subPageUnsubscribe) {
            this.subPageUnsubscribe();
        }
        this.subPage = this.subPages[id];
        this.subPageUnsubscribe = this.subPage.procedures.subscribe(procedures => this.procedures.value = procedures);
        this.procedureType.value = this.subPage.getProcedureType();
    }
    updateAirport(airport) {
        if (airport) {
            //this.selectProcedure(this.subPage.procedures.length > 0 ? 0 : null);
        }
    }
    updateSequence() {
        if (this.selectedProcedure) {
            this.sequence.value = this.selectedProcedure.getSequence(this.selectedTransition, null);
        }
    }
    updateWaypoints(waypoints) {
        return;
        let loaded = 0;
        let failed = 0;
        for (let waypoint of waypoints) {
            this.facilityLoader.getFacilityDataCB(waypoint.icao, (data) => {
                if (data) {
                    waypoint.SetFromIFacility(data);
                    loaded++;
                } else {
                    failed++;
                }
            });
        }

        let frame = () => {
            let minLatLong = null;
            let maxLatLong = null;
            for (let waypoint of waypoints) {
                if (waypoint.infos.coordinates.lat) {
                    if (minLatLong == null) {
                        minLatLong = new LatLong(waypoint.infos.coordinates.lat, waypoint.infos.coordinates.long);
                        maxLatLong = new LatLong(waypoint.infos.coordinates.lat, waypoint.infos.coordinates.long);
                    } else {
                        minLatLong.lat = Math.min(minLatLong.lat, waypoint.infos.coordinates.lat);
                        minLatLong.long = Math.min(minLatLong.long, waypoint.infos.coordinates.long);
                        maxLatLong.lat = Math.max(maxLatLong.lat, waypoint.infos.coordinates.lat);
                        maxLatLong.long = Math.max(maxLatLong.long, waypoint.infos.coordinates.long);
                    }
                }
            }
            if ((loaded + failed) < waypoints.length) {
                requestAnimationFrame(frame);
            } else {
                console.log(`Loaded ${loaded} / ${waypoints.length}...`);
                this.mapCoordinates.value = {
                    min: minLatLong,
                    max: maxLatLong
                };
                this.waypoints.value = waypoints;
            }
        }
        requestAnimationFrame(frame);
    }
    selectProcedure(procedureIndex) {
        this.selectedProcedure = this.subPage.getProcedure(procedureIndex);
        if (this.selectedProcedure) {
            console.log(JSON.stringify(this.selectedProcedure.getTransitions()));
            this.transitions.value = this.selectedProcedure.getTransitions();
            this.primaryFrequency.value = this.selectedProcedure.getPrimaryFrequency();
            this.selectTransition(this.transitions.value.length > 0 ? 0 : null);
        } else {
            this.transitions.value = null;
            this.primaryFrequency.value = null;
        }
    }
    selectTransition(transitionIndex) {
        this.selectedTransition = transitionIndex !== null ? this.selectedProcedure.getTransition(transitionIndex) : null;
        this.updateSequence();
    }
    selectFrequency() {
        if (this.primaryFrequency.value) {
            SimVar.SetSimVarValue("K:NAV1_RADIO_SWAP", "number", 0);
            SimVar.SetSimVarValue("K:NAV1_RADIO_SET_HZ", "hertz", Math.floor(parseFloat(this.primaryFrequency.value.mhValue) * 1000000));
        }
    }
    setICAO(icao) {
        this.icao = icao;
        this.facilityLoader.getFacilityCB(icao, (airport) => {
            if (airport) {
                this.airport.value = airport.infos;
            } else {
                console.log(`Failed to load "${icao}"`);
            }
        });
    }
    loadApproach() {
        SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewWaypointLatitude", "degrees", 52)
            .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewWaypointLongitude", "degrees", 0))
            .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanAddWaypoint", "number", 0))
            .then(() => this.flightPlan.updateFlightPlan())
            .then(() => {
                console.log("FPL: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanWaypointsNumber", "number"));
            })
            .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanWaypointIndex", "number", 0))
            .then(() => {
                console.log("Lat: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanWaypointLatitude", "degrees"));
                console.log("Long: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanWaypointLongitude", "degrees"));
            })
            // point 2
            .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewWaypointLatitude", "degrees", 52))
            .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewWaypointLongitude", "degrees", 2))
            .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanAddWaypoint", "number", 1))
            .then(() => this.flightPlan.updateFlightPlan())
            .then(() => {
                console.log("FPL: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanWaypointsNumber", "number"));
            })
            .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanWaypointIndex", "number", 1))
            .then(() => {
                console.log("Lat: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanWaypointLatitude", "degrees"));
                console.log("Long: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanWaypointLongitude", "degrees"));
            });


        //SimVar.SetSimVarValue("L:MAP_SHOW_TEMPORARY_FLIGHT_PLAN", "number", 1);

        /*SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewWaypointLatitude", "degrees", 60)
        .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewWaypointLongitude", "degrees", 0))
        .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanAddWaypoint", "number", 1))
        .then(() => this.flightPlan.updateFlightPlan())
        .then(() => console.log("FPL: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanWaypointsNumber", "number")));

        SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewWaypointLatitude", "degrees", 70)
        .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewWaypointLongitude", "degrees", 0))
        .then(() => SimVar.SetSimVarValue("C:fs9gps:FlightPlanAddWaypoint", "number", 1))
        .then(() => this.flightPlan.updateFlightPlan())
        .then(() => console.log("FPL: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanWaypointsNumber", "number")));*/
    }
    activateApproach() {
        this.gps.showConfirmDialog("Are you sure you want to activate this approach?").then(() => {
            if (this.airport.value.infos.icao && this.approachIndex !== null) {
                SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewApproachAirport", "string", this.airport.value.infos.icao);
                SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewApproachApproach", "number", this.approachIndex);
                SimVar.SetSimVarValue("C:fs9gps:FlightPlanNewApproachTransition", "number", this.transitionIndex ? this.transitionIndex : 0);
                SimVar.SetSimVarValue("C:fs9gps:FlightPlanLoadApproach", "number", 2);
                this.flightPlan.setActiveWaypointIndex(0);
                console.log("FPL: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanWaypointsNumber", "number"));
                console.log("APR: " + SimVar.GetSimVarValue("C:fs9gps:FlightPlanApproachWaypointsNumber", "number"));

                /*this.flightPlan.setDestination(this.airport.value.infos.icao, () => {                    
                    this.flightPlan.setApproachIndex(this.approachIndex, () => {
                        console.log("Set approach index");
                        this.flightPlan.activateApproach();
                        console.log("Activated approach");
                    }, this.transitionIndex ? this.transitionIndex : 0);
                });*/
            }
        });
    }
}

class WT_Approach_Page_View extends WT_HTML_View {
    constructor() {
        super();

        this.inputLayer = new Selectables_Input_Layer(new Selectables_Input_Layer_Dynamic_Source(this, "drop-down-selector, numeric-input, string-input, icao-input, toggle-switch, .sequence-entry, .selectable, selectable-button"));
        this.inputLayer.setExitHandler(this);
    }
    /**
     * @param {WT_Approach_Page_Model} model 
     */
    setModel(model) {
        this.model = model;
        this.model.procedureType.subscribe(type => this.elements.procedureType.textContent = type);
        this.model.procedures.subscribe(this.updateProcedures.bind(this));
        this.model.transitions.subscribe(this.updateTransitions.bind(this));
        this.model.sequence.subscribe(this.updateSequence.bind(this));
        this.model.primaryFrequency.subscribe(this.updatePrimaryFrequency.bind(this));

        return;
        this.mapProperties = new CombinedSubject([this.model.mapCoordinates, this.model.waypoints], (coordinates, sequence) => {
            let min = coordinates.min;
            let max = coordinates.max;

            // Delta coordinates defining boundary of waypoints
            // TODO: This needs fixing for points on the date line
            let dlon = (max.long - min.long) * Avionics.Utils.DEG2RAD;
            let dlat = (max.lat - min.lat) * Avionics.Utils.DEG2RAD;

            // Radius of eath in NM
            let R = 3440.1;

            // Use haversine formula on each direction to find max radius needed
            let a = Math.pow(Math.sin(dlat / 2), 2) + Math.cos(min.lat) * Math.cos(max.lat) * Math.pow(Math.sin(dlon / 2), 2);
            let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            let distanceLat = R * c;

            /*a = Math.cos(min.lat) * Math.cos(max.lat) * Math.pow(Math.sin(dlon / 2), 2);
            c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
            let distanceLong = R * c;*/

            let maxDistance = distanceLat / 2;//Math.max(distanceLat, distanceLong);
            //console.log(distanceLong + " " + distanceLat);

            return {
                approach: this.model.selectedApproach,
                coordinates: new LatLong((min.lat + max.lat) / 2, (min.long + max.long) / 2),
                radius: maxDistance * 1.3,
                sequence: sequence.filter(waypoint => (waypoint.infos.lat != 0))
            };
        });
        this.mapProperties.subscribe(this.updateMap.bind(this));

        //this.elements.icaoInput.ident = this.model.icao;
    }
    buildMapColors() {
        let curve = new Avionics.Curve();
        curve.interpolationFunction = Avionics.CurveTool.StringColorRGBInterpolation;

        let svgConfig = new SvgMapConfig();
        curve.add(0, svgConfig.convertColor("#000000"));
        curve.add(16000, svgConfig.convertColor("#000000"));

        let colors = [SvgMapConfig.hexaToRGB(svgConfig.convertColor("#000080"))];

        for (let i = 0; i < 60; i++) {
            let color = curve.evaluate(i * 30000 / 60);
            colors[i + 1] = SvgMapConfig.hexaToRGB(color);
        }

        return colors;
    }
    connectedCallback() {
        let template = document.getElementById('approach-page');
        let templateContent = template.content;

        this.appendChild(templateContent.cloneNode(true));
        super.connectedCallback();

        let bingMap = this.elements.bingMap;
        bingMap.setMode(EBingMode.VFR);
        bingMap.setBingId("approachMap");
        bingMap.addConfig({ resolution: 1024, aspectRatio: 1, heightColors: this.buildMapColors() });
        bingMap.setConfig(0);
        bingMap.setReference(EBingReference.PLANE);
        bingMap.setVisible(true);

        this.elements.procedureSelector.addEventListener("change", e => this.model.selectProcedure(e.target.value));
        this.elements.transitionSelector.addEventListener("change", e => this.model.selectTransition(e.target.value));
        this.elements.primaryFrequencyHz.addEventListener("selected", e => this.model.selectFrequency());
    };
    updateIcao(icao) {
        this.model.setICAO(icao);
    }
    loadApproach() {
        this.model.loadApproach();
    }
    activateApproach() {
        this.model.activateApproach();
    }
    updateMap(properties) {
        let coordinates = properties.coordinates;
        if (coordinates) {
            this.elements.bingMap.setParams({ lla: coordinates, radius: properties.radius * 1852 }); // 1852 converts NM to Metres
        }
        this.renderSequence(properties);
    }
    updatePrimaryFrequency(frequency) {
        if (frequency) {
            this.elements.primaryFrequencyName.textContent = frequency.name;
            this.elements.primaryFrequencyHz.textContent = frequency.mhValue.toFixed(3);
        } else {
            this.elements.primaryFrequencyName.textContent = "____";
            this.elements.primaryFrequencyHz.textContent = "___.__";
        }
    }
    updateProcedures(procedures) {
        this.elements.procedureSelector.clearOptions();
        if (procedures) {
            let i = 0;
            for (let procedure of procedures) {
                this.elements.procedureSelector.addOption(i++, procedure.name);
            }
        }
    }
    updateTransitions(transitions) {
        this.elements.transitionSelector.clearOptions();
        if (transitions) {
            let i = 0;
            for (let transition of transitions) {
                this.elements.transitionSelector.addOption(i++, transition.name);
            }
        }
    }
    updateSequence(waypoints) {
        if (waypoints) {
            console.log("Updating sequence length: " + waypoints.length);
            this.elements.sequenceList.innerHTML = waypoints.map((waypoint) => {
                //let distance = waypoint.distanceInFP * 0.000539957;
                return `
                    <div class="sequence-entry">
                        <span class="ident">${waypoint.ident ? waypoint.ident : "USR"}</span>
                        <span class="bearing">${waypoint.bearing}°</span>
                        <span class="distance">${(waypoint.distance).toFixed(waypoint.distance < 10 ? 1 : 0)}NM</span>
                    </div>`;
            }).join("");
        } else {
            this.elements.sequenceList.innerHTML = "";
        }
    }
    renderSequence(properties) {
        return;
        let waypoints = properties.sequence;

        let _NMWidth = properties.radius * 2;
        let centerCoordinates = properties.coordinates;
        let _angularWidth = _NMWidth / 60 / Math.cos(centerCoordinates.lat * Avionics.Utils.DEG2RAD);
        let _angularHeight = _NMWidth / 60;
        let _bottomLeftCoordinates = new LatLong(centerCoordinates.lat - _angularHeight * 0.5, centerCoordinates.long - _angularWidth * 0.5);
        let _topRightCoordinates = new LatLong(centerCoordinates.lat + _angularHeight * 0.5, centerCoordinates.long + _angularWidth * 0.5);
        let _angularWidthNorth = _NMWidth / 60 / Math.cos(_topRightCoordinates.lat * Avionics.Utils.DEG2RAD);
        let _angularWidthSouth = _NMWidth / 60 / Math.cos(_bottomLeftCoordinates.lat * Avionics.Utils.DEG2RAD);

        let coordinatesToXYToRef = (coordinates) => {
            let xNorth = (coordinates.long - properties.coordinates.long) / _angularWidthNorth * 1000;
            let xSouth = (coordinates.long - properties.coordinates.long) / _angularWidthSouth * 1000;
            let deltaLat = (coordinates.lat - properties.coordinates.lat) / _angularHeight;
            let y = -deltaLat * 1000;
            deltaLat += 0.5;
            let x = xNorth * deltaLat + xSouth * (1 - deltaLat);
            return {
                x: x + 500,
                y: y + 500,
            }
        }

        // All transitions
        let transitionsPath = "";
        for (let transition of properties.approach.transitions) {
            let i = 0;
            let pathElements = transition.waypoints.map(waypoint => {
                if (!waypoint.infos.coordinates)
                    return "";
                let mapPosition = coordinatesToXYToRef(waypoint.infos.coordinates);
                if (!isNaN(mapPosition.x)) {
                    return `${(i++ == 0) ? "M" : "L"}${mapPosition.x.toFixed()} ${mapPosition.y.toFixed()}`;
                } else {
                    return "";
                }
            });
            transitionsPath += pathElements.join(" ") + " ";
        }
        this.elements.allTransitionsPath.setAttribute("d", transitionsPath);

        // Selected transition
        let i = 0;
        let pathElements = waypoints.map(waypoint => {
            let mapPosition = coordinatesToXYToRef(waypoint.infos.coordinates);
            if (!isNaN(mapPosition.x)) {
                return `${(i++ == 0) ? "M" : "L"}${mapPosition.x.toFixed()} ${mapPosition.y.toFixed()}`;
            } else {
                return "";
            }
        });
        let path = pathElements.join(" ");
        console.log(path);
        this.elements.selectedApproachPath.setAttribute("d", path);

        // Waypoints
        let waypointMarkers = [];
        waypointMarkers = waypoints.map(waypoint => {
            let mapPosition = coordinatesToXYToRef(waypoint.infos.coordinates);
            if (!isNaN(mapPosition.x)) {
                return `<g transform="translate(${mapPosition.x.toFixed()},${mapPosition.y.toFixed() - 30})">
                    <rect x="-50" y="-20" width="100" height="40" fill="white" stroke-width="2" stroke="#444"></rect>                    
                    <text x="0" y="15" fill="#000" style="text-anchor: middle;" font-family="Roboto-Bold" font-size="30">${waypoint.infos.ident}</text>
                    <path fill="#00ffff" stroke-width="2" stroke="#000" d="M0 20 L-15 40 L15 40z"></path>
                </g>`;
            } else {
                return "";
            }
        });
        this.elements.selectedApproachWaypoints.innerHTML = waypointMarkers.join("");
    }
    enter(gps, inputStack) {
        this.gps = gps;
        this.inputStack = inputStack;

        this.inputStackHandle = inputStack.push(this.inputLayer);
    }
    back() {
        this.exit();
    }
    exit() {
        if (this.inputStackHandle) {
            this.inputStackHandle.pop();
            this.inputStackHandle = null;
        }
        this.parentNode.removeChild(this);
    }
}
customElements.define("g1000-approach-page", WT_Approach_Page_View);