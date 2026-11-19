# Blackout Maps

Blackout Maps is an offline map for when the network goes down. Water, medical care and supplies stay on the phone.

The base map, roads and buildings come with the app. Places, water, addresses and geography download by country or state, and then stay on the device.

<img src="docs/iphone-map.png" alt="Blackout Maps on an iPhone" width="280">

## Features

### Services

The map shows water, health, police, fire, fuel, supermarkets and restaurants. Each category has its own icon. A wide view shows one or two places from each category that is actually in sight. Zooming in shows more of them. In a dense area, every place appears only when the zoom is already close.

### Routes

You can follow a route on foot, by bicycle or by car.

### Pins

You can save a place, give it a name and remove it later.

### Directions

During navigation, a map button opens the full list of directions from the start of the trip to the destination.

### Position

The app does not use GPS. You set your position on the map, and the phone’s motion sensors keep an approximate position on the device. You can turn the sensors off and change the step length.

### Map packages

Countries and states live in the `catalog/` folder. Portugal downloads on first launch. Any other place is added from Settings, where it appears with its flag and name.

### Privacy

There is no login, no charge and no data collection. Sensor readings stay on the phone.

## Contributing

Updated maps of services are welcome. To add a country or a state, follow [catalog/README.md](catalog/README.md).
