const { paginateResults } = require('./utils');
const stripe = require('stripe')('sk_test_J4BhpL7ZYwJSwYN8u8V2ImWD00D5MP2PZV');

const pay = async (cardToken, launches) => {
    try {
        let intent = await stripe.paymentIntents.create({
            amount: 999999999.00 * launches,
            currency: 'usd',
            payment_method: cardToken,
            confirm: true,
            error_on_requires_action: true
        });

        if (intent.status === 'succeeded') return true;
        else return false;
    } catch (e) {
        return false;
    }
}

module.exports = {
    Query: {
        launches: async (_, { pageSize = 20, after }, { dataSources }) => {
            const allLaunches = await dataSources.launchAPI.getAllLaunches();
            allLaunches.reverse();

            const launches = paginateResults({
                after,
                pageSize,
                results: allLaunches,
            });

            return {
                launches,
                cursor: launches.length ? launches[launches.length - 1].cursor : null,
                hasMore: launches.length
                    ? launches[launches.length - 1].cursor !==
                    allLaunches[allLaunches.length - 1].cursor
                    : false,
            };
        },
        launch: (_, { id }, { dataSources }) =>
            dataSources.launchAPI.getLaunchById({ launchId: id }),
        me: async (_, __, { dataSources }) =>
            dataSources.userAPI.findOrCreateUser(),
    },
    Mutation: {
        bookTrips: async (_, { launchIds, cardToken }, { dataSources }) => {
            const payResult = await pay(cardToken, launchIds.length);

            if (payResult) {
                const results = await dataSources.userAPI.bookTrips({ launchIds });
                const launches = await dataSources.launchAPI.getLaunchesByIds({
                    launchIds,
                });



                return {
                    success: results && results.length === launchIds.length,
                    message:
                        results.length === launchIds.length
                            ? `trips booked successfully, ${launches.length * 100.00}$ debited`
                            : `the following launches couldn't be booked: ${launchIds.filter(
                                id => !results.includes(id),
                            )}`,
                    launches,
                };
            }
            else {
                return {
                    success: false,
                    message: "Error! Not enough money on the card",
                    launches,
                };
            }

        },
        cancelTrip: async (_, { launchId }, { dataSources }) => {
            const result = dataSources.userAPI.cancelTrip({ launchId });

            if (!result)
                return {
                    success: false,
                    message: 'failed to cancel trip',
                };

            const launch = await dataSources.launchAPI.getLaunchById({ launchId });
            return {
                success: true,
                message: 'trip cancelled',
                launches: [launch],
            };
        },
        login: async (_, { email }, { dataSources }) => {
            const user = await dataSources.userAPI.findOrCreateUser({ email });
            if (user) return new Buffer(email).toString('base64');
        },
        uploadProfileImage: async (_, { file }, { dataSources }) =>
            dataSources.userAPI.uploadProfileImage({ file }),
    },
    Launch: {
        isBooked: async (launch, _, { dataSources }) =>
            dataSources.userAPI.isBookedOnLaunch({ launchId: launch.id }),
    },
    Mission: {
        missionPatch: (mission, { size } = { size: 'LARGE' }) => {
            return size === 'SMALL'
                ? mission.missionPatchSmall
                : mission.missionPatchLarge;
        },
    },
    User: {
        trips: async (_, __, { dataSources }) => {
            const launchIds = await dataSources.userAPI.getLaunchIdsByUser();

            if (!launchIds.length) return [];

            return (
                dataSources.launchAPI.getLaunchesByIds({
                    launchIds,
                }) || []
            );
        },
    },
};